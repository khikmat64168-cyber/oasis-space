import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { ObjectId } from 'mongoose';
import { ConversationService } from './conversation.service';
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
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MemberType } from '../../libs/enums/member.enums';
import { shapeIntoMongoObjectId } from '../../libs/config';

/**
 * Abuse limiter, same in-memory shape as the assistant resolver and the auth
 * controller. Writing is cheap for the sender and noisy for the recipient.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_HOUR = 60;
const buckets = new Map<string, { count: number; resetAt: number }>();

const takeToken = (key: string): boolean => {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	if (bucket.count >= MAX_PER_HOUR) return false;
	bucket.count += 1;
	return true;
};

const sweep = () => {
	const now = Date.now();
	for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
};

@Resolver()
export class ConversationResolver {
	constructor(private readonly conversationService: ConversationService) {}

	/**
	 * Open a thread with an agent, or continue the existing one.
	 *
	 * CLIENT only: an agent writes back inside a thread with sendMessage, and
	 * starting one is how a client reaches a grower. Enforced here, not by
	 * hiding the button.
	 */
	@Roles(MemberType.CLIENT)
	@UseGuards(RolesGuard)
	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Mutation(() => Conversation)
	public async startConversation(
		@Args('input') input: StartConversationInput,
		@AuthMember('_id') clientId: ObjectId,
	): Promise<Conversation> {
		console.log('Mutation: startConversation');
		sweep();
		if (!takeToken(`msg:${String(clientId)}`)) throw new BadRequestException('MESSAGE_RATE_LIMITED');

		return this.conversationService.startConversation(clientId, input);
	}

	/** A reply from either participant. Membership is checked in the service. */
	@UseGuards(AuthGuard)
	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Mutation(() => ConversationMessage)
	public async sendMessage(
		@Args('input') input: SendMessageInput,
		@AuthMember('_id') senderId: ObjectId,
	): Promise<ConversationMessage> {
		console.log('Mutation: sendMessage');
		sweep();
		if (!takeToken(`msg:${String(senderId)}`)) throw new BadRequestException('MESSAGE_RATE_LIMITED');

		return this.conversationService.sendMessage(senderId, input);
	}

	/** The caller's inbox. The id is the caller's; it is never an argument. */
	@UseGuards(AuthGuard)
	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Query(() => Conversations)
	public async getMyConversations(
		@Args('input') input: ConversationsInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Conversations> {
		console.log('Query: getMyConversations');
		return this.conversationService.getMyConversations(memberId, input);
	}

	/** One thread's messages. Reading it clears the caller's own badge. */
	@UseGuards(AuthGuard)
	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Query(() => ConversationMessages)
	public async getConversationMessages(
		@Args('input') input: MessagesInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<ConversationMessages> {
		console.log('Query: getConversationMessages');
		return this.conversationService.getMessages(memberId, input);
	}

	/** One thread's header, for opening a conversation straight from a notification. */
	@UseGuards(AuthGuard)
	@Query(() => Conversation)
	public async getConversation(
		@Args('conversationId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Conversation> {
		console.log('Query: getConversation');
		return this.conversationService.getConversation(memberId, shapeIntoMongoObjectId(input) as ObjectId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Conversation)
	public async markConversationRead(
		@Args('conversationId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Conversation> {
		console.log('Mutation: markConversationRead');
		return this.conversationService.markConversationRead(memberId, shapeIntoMongoObjectId(input) as ObjectId);
	}
}
