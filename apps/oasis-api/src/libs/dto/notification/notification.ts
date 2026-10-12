import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { NotificationStatus, NotificationType } from '../../enums/notification.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class Notification {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	receiverId!: ObjectId;

	@Field(() => String, { nullable: true })
	senderId?: ObjectId;

	@Field(() => NotificationType)
	notificationType!: NotificationType;

	@Field(() => NotificationStatus)
	notificationStatus!: NotificationStatus;

	@Field(() => String)
	notificationTitle!: string;

	@Field(() => String, { nullable: true })
	notificationDesc?: string;

	@Field(() => String, { nullable: true })
	orderId?: ObjectId;

	@Field(() => String, { nullable: true })
	orderItemId?: ObjectId;

	@Field(() => String, { nullable: true })
	inquiryId?: ObjectId;

	@Field(() => String, { nullable: true })
	conversationId?: ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;
}

@ObjectType()
export class Notifications {
	@Field(() => [Notification])
	list!: Notification[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter?: TotalCounter[];
}

@ObjectType()
export class NotificationCount {
	@Field(() => Int)
	unread!: number;
}
