import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import {
	Conversation,
	ConversationMessage,
	ConversationMessages,
	Conversations,
} from '../../libs/dto/conversation/conversation';
import {
	ConversationsInquiry,
	MessagesInquiry,
	SendMessageInput,
	StartConversationInput,
} from '../../libs/dto/conversation/conversation.input';
import { Member } from '../../libs/dto/member/member';
import { MemberStatus, MemberType } from '../../libs/enums/member.enums';
import { NotificationType } from '../../libs/enums/notification.enum';
import { NotificationService } from '../notification/notification.service';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { T } from '../../libs/types/common';

/** A repeat of the same text inside this window is the same message. */
const DEDUPE_WINDOW_MS = 10_000;

/** How much of the message the other side sees on the notification itself. */
const PREVIEW_LENGTH = 140;

@Injectable()
export class ConversationService {
	constructor(
		@InjectModel('Conversation') private readonly conversationModel: Model<T>,
		@InjectModel('ConversationMessage') private readonly messageModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly notificationService: NotificationService,
	) {}

	/* ------------------------------------------------------------------ *
	 * writing
	 * ------------------------------------------------------------------ */

	/**
	 * A client's first message to an agent — or their next one, if a thread
	 * already exists.
	 *
	 * The pair is unique, so asking a second question continues the same
	 * conversation rather than opening a parallel one. `clientId` is always
	 * the authenticated caller.
	 */
	public async startConversation(clientId: ObjectId, input: StartConversationInput): Promise<Conversation> {
		const text = input.text?.trim();
		if (!text) throw new BadRequestException('MESSAGE_EMPTY');

		const agentId = this.toObjectId(input.agentId, 'RECIPIENT_INVALID');
		if (String(agentId) === String(clientId)) throw new BadRequestException('RECIPIENT_SELF');

		/*
		 * The recipient is resolved against the member collection rather than
		 * trusted. The feature is for reaching growers, so a CLIENT or ADMIN
		 * id is refused even though it is a real member — otherwise this
		 * becomes a way to message any account on the platform.
		 */
		const agent = await this.memberModel
			.findById(agentId)
			.select('memberType memberStatus')
			.lean<{ memberType: MemberType; memberStatus: MemberStatus }>()
			.exec();

		if (!agent) throw new NotFoundException('RECIPIENT_NOT_FOUND');
		if (agent.memberType !== MemberType.AGENT) throw new BadRequestException('RECIPIENT_NOT_AGENT');
		if (agent.memberStatus !== MemberStatus.ACTIVE) throw new BadRequestException('RECIPIENT_UNAVAILABLE');

		const plantId = input.plantId ? this.toObjectId(input.plantId, 'PLANT_INVALID') : undefined;

		/*
		 * Upsert on the unique pair. Two simultaneous first messages would
		 * otherwise race into a duplicate-key error; this resolves both to the
		 * same thread.
		 */
		const conversation = await this.conversationModel
			.findOneAndUpdate(
				{ clientId, agentId },
				{
					$setOnInsert: {
						clientId,
						agentId,
						...(plantId ? { plantId } : {}),
						clientUnread: 0,
						agentUnread: 0,
					},
				},
				{ new: true, upsert: true },
			)
			.exec();

		await this.append(conversation, clientId, text, MemberType.CLIENT);
		return this.decorate(conversation._id as ObjectId, clientId);
	}

	/** A reply from either side, inside a thread the caller belongs to. */
	public async sendMessage(senderId: ObjectId, input: SendMessageInput): Promise<ConversationMessage> {
		const text = input.text?.trim();
		if (!text) throw new BadRequestException('MESSAGE_EMPTY');

		const conversationId = this.toObjectId(input.conversationId, 'CONVERSATION_INVALID');
		const conversation = await this.requireParticipant(conversationId, senderId);

		const side =
			String(conversation.clientId) === String(senderId) ? MemberType.CLIENT : MemberType.AGENT;

		return this.append(conversation, senderId, text, side);
	}

	/**
	 * Append a message, move the thread to the top, raise the other side's
	 * badge and tell them.
	 *
	 * A repeated identical message within a few seconds is treated as a
	 * double submission and returns the message already stored, so a second
	 * click cannot post twice or notify twice.
	 */
	private async append(
		conversation: T,
		senderId: ObjectId,
		text: string,
		side: MemberType,
	): Promise<ConversationMessage> {
		const recent = await this.messageModel
			.findOne({
				conversationId: conversation._id,
				senderId,
				text,
				createdAt: { $gt: new Date(Date.now() - DEDUPE_WINDOW_MS) },
			})
			.exec();
		if (recent) return recent as unknown as ConversationMessage;

		const message = await this.messageModel.create({ conversationId: conversation._id, senderId, text });

		const preview = text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trimEnd()}…` : text;
		// the badge belongs to whoever did NOT write this
		const unreadField = side === MemberType.CLIENT ? 'agentUnread' : 'clientUnread';

		await this.conversationModel
			.updateOne(
				{ _id: conversation._id },
				{
					$set: { lastMessageAt: new Date(), lastMessagePreview: preview, lastSenderId: senderId },
					$inc: { [unreadField]: 1 },
				},
			)
			.exec();

		const receiverId = side === MemberType.CLIENT ? conversation.agentId : conversation.clientId;
		const sender = await this.memberModel
			.findById(senderId)
			.select('memberNick memberFullName')
			.lean<{ memberNick: string; memberFullName?: string }>()
			.exec();
		const who = sender?.memberFullName || sender?.memberNick || 'Someone';

		/*
		 * Written through the existing notification service so the bell, the
		 * unread count and the read flow work unchanged. record() is
		 * best-effort by design: a notification that fails to write must not
		 * lose the message, which is already saved above.
		 */
		await this.notificationService.record([
			{
				receiverId,
				senderId,
				notificationType:
					side === MemberType.CLIENT ? NotificationType.AGENT_INQUIRY : NotificationType.AGENT_REPLY,
				notificationTitle:
					side === MemberType.CLIENT ? `${who} sent you a question` : `${who} replied to your question`,
				notificationDesc: preview,
				conversationId: conversation._id,
			},
		]);

		return message as unknown as ConversationMessage;
	}

	/* ------------------------------------------------------------------ *
	 * reading
	 * ------------------------------------------------------------------ */

	/** Every thread the caller belongs to, most recently active first. */
	public async getMyConversations(memberId: ObjectId, input: ConversationsInquiry): Promise<Conversations> {
		const match = { $or: [{ clientId: memberId }, { agentId: memberId }] };

		const result = await this.conversationModel
			.aggregate([
				{ $match: match },
				{ $sort: { lastMessageAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							// the partner is whichever side the caller is not
							{
								$addFields: {
									partnerId: {
										$cond: [{ $eq: ['$clientId', memberId] }, '$agentId', '$clientId'],
									},
									unread: {
										$cond: [{ $eq: ['$clientId', memberId] }, '$clientUnread', '$agentUnread'],
									},
								},
							},
							{ $lookup: { from: 'members', localField: 'partnerId', foreignField: '_id', as: 'partner' } },
							{ $unwind: { path: '$partner', preserveNullAndEmptyArrays: true } },
							// never ship the other side's badge to this caller
							{ $project: { clientUnread: 0, agentUnread: 0, 'partner.memberPassword': 0 } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		return result[0] ?? { list: [], metaCounter: [] };
	}

	/**
	 * One thread's messages, oldest first.
	 *
	 * Reading a thread clears the caller's own badge and stamps the other
	 * side's messages as read — never their own, and never the other
	 * participant's badge.
	 */
	public async getMessages(memberId: ObjectId, input: MessagesInquiry): Promise<ConversationMessages> {
		const conversationId = this.toObjectId(input.conversationId, 'CONVERSATION_INVALID');
		const conversation = await this.requireParticipant(conversationId, memberId);

		const result = await this.messageModel
			.aggregate([
				{ $match: { conversationId } },
				{ $sort: { createdAt: 1 } },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		await this.markRead(memberId, conversation);
		return result[0] ?? { list: [], metaCounter: [] };
	}

	/** One thread's header, decorated for this caller. */
	public async getConversation(memberId: ObjectId, conversationId: ObjectId): Promise<Conversation> {
		await this.requireParticipant(conversationId, memberId);
		return this.decorate(conversationId, memberId);
	}

	/** Clear the caller's unread badge. Only ever their own side. */
	public async markConversationRead(memberId: ObjectId, conversationId: ObjectId): Promise<Conversation> {
		const conversation = await this.requireParticipant(conversationId, memberId);
		await this.markRead(memberId, conversation);
		return this.decorate(conversationId, memberId);
	}

	/* ------------------------------------------------------------------ *
	 * internals
	 * ------------------------------------------------------------------ */

	/**
	 * The single authorization gate. Everything that touches a thread goes
	 * through here, so a future caller cannot reach messages by forgetting a
	 * check in a resolver.
	 *
	 * ADMIN is NOT granted access: a private question between two members is
	 * not operational data, and the existing notification policy already
	 * scopes reads to the receiver alone.
	 */
	private async requireParticipant(conversationId: ObjectId, memberId: ObjectId): Promise<T> {
		const conversation = await this.conversationModel.findById(conversationId).exec();
		if (!conversation) throw new NotFoundException('CONVERSATION_NOT_FOUND');

		const isParticipant =
			String(conversation.clientId) === String(memberId) || String(conversation.agentId) === String(memberId);
		if (!isParticipant) throw new ForbiddenException('CONVERSATION_FORBIDDEN');

		return conversation;
	}

	private async markRead(memberId: ObjectId, conversation: T): Promise<void> {
		const isClient = String(conversation.clientId) === String(memberId);
		const field = isClient ? 'clientUnread' : 'agentUnread';

		await this.conversationModel.updateOne({ _id: conversation._id }, { $set: { [field]: 0 } }).exec();
		// only the other participant's messages become "read"; marking your own
		// would make the sender's ticks lie
		await this.messageModel
			.updateMany(
				{ conversationId: conversation._id, senderId: { $ne: memberId }, readAt: null },
				{ $set: { readAt: new Date() } },
			)
			.exec();
	}

	private async decorate(conversationId: ObjectId, memberId: ObjectId): Promise<Conversation> {
		const [result] = await this.conversationModel
			.aggregate([
				{ $match: { _id: conversationId } },
				{
					$addFields: {
						partnerId: { $cond: [{ $eq: ['$clientId', memberId] }, '$agentId', '$clientId'] },
						unread: { $cond: [{ $eq: ['$clientId', memberId] }, '$clientUnread', '$agentUnread'] },
					},
				},
				{ $lookup: { from: 'members', localField: 'partnerId', foreignField: '_id', as: 'partner' } },
				{ $unwind: { path: '$partner', preserveNullAndEmptyArrays: true } },
				{ $project: { clientUnread: 0, agentUnread: 0, 'partner.memberPassword': 0 } },
			])
			.exec();

		if (!result) throw new NotFoundException('CONVERSATION_NOT_FOUND');
		return result;
	}

	private toObjectId(value: string, errorCode: string): ObjectId {
		try {
			return shapeIntoMongoObjectId(value) as ObjectId;
		} catch {
			throw new BadRequestException(errorCode);
		}
	}
}
