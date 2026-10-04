import { Schema } from 'mongoose';
import { NotificationStatus, NotificationType } from '../libs/enums/notification.enum';

// One thing that happened, addressed to one member. Written by OrderService at
// the moment the order state changes; never generated on read. Read access is
// scoped to receiverId in NotificationService, so a member can only ever see
// their own.
const NotificationSchema = new Schema(
	{
		receiverId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		// who caused it; absent when the system did
		senderId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},

		notificationType: {
			type: String,
			enum: NotificationType,
			required: true,
		},

		notificationStatus: {
			type: String,
			enum: NotificationStatus,
			default: NotificationStatus.WAIT,
		},

		notificationTitle: {
			type: String,
			required: true,
			trim: true,
		},

		notificationDesc: {
			type: String,
			trim: true,
		},

		// what it is about, so the UI can link straight to it
		orderId: {
			type: Schema.Types.ObjectId,
			ref: 'Order',
		},

		orderItemId: {
			type: Schema.Types.ObjectId,
			ref: 'OrderItem',
		},
	},
	{ timestamps: true, collection: 'notifications' },
);

// the only two reads that exist: my newest first, and my unread count
NotificationSchema.index({ receiverId: 1, createdAt: -1 });
NotificationSchema.index({ receiverId: 1, notificationStatus: 1 });

export default NotificationSchema;
