import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Notification, NotificationCount, Notifications } from '../../libs/dto/notification/notification';
import { NotificationsInquiry } from '../../libs/dto/notification/notification.input';
import { NotificationStatus, NotificationType } from '../../libs/enums/notification.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enums';
import { Member } from '../../libs/dto/member/member';
import { Direction, Message } from '../../libs/Errors';
import { T } from '../../libs/types/common';

/** What the order flow hands in; receiverId is who will see it. */
export interface NotificationDraft {
	receiverId: ObjectId;
	senderId?: ObjectId;
	notificationType: NotificationType;
	notificationTitle: string;
	notificationDesc?: string;
	orderId?: ObjectId;
	orderItemId?: ObjectId;
	inquiryId?: ObjectId;
	conversationId?: ObjectId;
}

@Injectable()
export class NotificationService {
	constructor(
		@InjectModel('Notification') private readonly notificationModel: Model<Notification>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
	) {}

	/**
	 * Who the platform-level copies go to.
	 *
	 * Queried rather than hardcoded. There is one admin today, but an id written
	 * into the source would quietly notify nobody the day that member is
	 * replaced, and nothing would surface the failure.
	 */
	public async activeAdminIds(): Promise<ObjectId[]> {
		try {
			const admins = await this.memberModel
				.find({ memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE }, { _id: 1 })
				.lean()
				.exec();
			return admins.map((a: any) => a._id);
		} catch (err) {
			console.log('Error, NotificationService.activeAdminIds:', err);
			return [];
		}
	}

	/**
	 * Write notifications for something that just happened.
	 *
	 * Deliberately best-effort: a notification is a side record of an order, so
	 * failing to write one must never roll back or fail the order itself. The
	 * caller is already past a succeeded write when it reaches here.
	 */
	public async record(drafts: NotificationDraft[]): Promise<void> {
		const wanted = drafts.filter(
			// Nobody is told about their own action: the member who pressed the
			// button already knows, and a self-notification reads as a bug.
			(d) => d.receiverId && String(d.receiverId) !== String(d.senderId),
		);
		if (!wanted.length) return;
		try {
			await this.notificationModel.insertMany(wanted);
		} catch (err) {
			console.log('Error, NotificationService.record:', err);
		}
	}

	/** My own timeline. Scoped to the caller — there is no way to read anyone else's. */
	public async getMyNotifications(receiverId: ObjectId, input: NotificationsInquiry): Promise<Notifications> {
		const match: T = { receiverId: receiverId };
		if (input?.search?.notificationStatus) match.notificationStatus = input.search.notificationStatus;

		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		const result = await this.notificationModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return result[0];
	}

	/** Drives the badge on the bell. */
	public async getUnreadCount(receiverId: ObjectId): Promise<NotificationCount> {
		const unread = await this.notificationModel
			.countDocuments({ receiverId: receiverId, notificationStatus: NotificationStatus.WAIT })
			.exec();
		return { unread };
	}

	/** Marking is scoped to the receiver, so one member cannot touch another's row. */
	public async markRead(receiverId: ObjectId, notificationId: ObjectId): Promise<Notification> {
		const result = await this.notificationModel
			.findOneAndUpdate(
				{ _id: notificationId, receiverId: receiverId },
				{ notificationStatus: NotificationStatus.READ },
				{ new: true },
			)
			.exec();
		if (!result) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return result;
	}

	public async markAllRead(receiverId: ObjectId): Promise<NotificationCount> {
		await this.notificationModel
			.updateMany(
				{ receiverId: receiverId, notificationStatus: NotificationStatus.WAIT },
				{ notificationStatus: NotificationStatus.READ },
			)
			.exec();
		return { unread: 0 };
	}
}
