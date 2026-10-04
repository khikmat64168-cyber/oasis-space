import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import type { ObjectId } from 'mongoose';
import { NotificationService } from './notification.service';
import { Notification, NotificationCount, Notifications } from '../../libs/dto/notification/notification';
import { NotificationsInquiry } from '../../libs/dto/notification/notification.input';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { shapeIntoMongoObjectId } from '../../libs/config';

/**
 * Every operation is scoped to the authenticated member: the receiver is taken
 * from the token, never from an argument, so there is no shape of request that
 * reads or marks somebody else's notifications.
 */
@Resolver()
export class NotificationResolver {
	constructor(private readonly notificationService: NotificationService) {}

	@UseGuards(AuthGuard)
	@Query(() => Notifications)
	public async getMyNotifications(
		@Args('input') input: NotificationsInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Notifications> {
		console.log('Query: getMyNotifications');
		return await this.notificationService.getMyNotifications(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => NotificationCount)
	public async getNotificationCount(@AuthMember('_id') memberId: ObjectId): Promise<NotificationCount> {
		console.log('Query: getNotificationCount');
		return await this.notificationService.getUnreadCount(memberId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Notification)
	public async markNotificationRead(
		@Args('notificationId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Notification> {
		console.log('Mutation: markNotificationRead');
		return await this.notificationService.markRead(memberId, shapeIntoMongoObjectId(input));
	}

	@UseGuards(AuthGuard)
	@Mutation(() => NotificationCount)
	public async markAllNotificationsRead(@AuthMember('_id') memberId: ObjectId): Promise<NotificationCount> {
		console.log('Mutation: markAllNotificationsRead');
		return await this.notificationService.markAllRead(memberId);
	}
}
