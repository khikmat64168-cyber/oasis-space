import { Schema } from 'mongoose';

/**
 * One message inside a private conversation.
 *
 * Separate from the public `Message` collection, which is the shared chat room
 * and has no recipient. Kept separate from Notification too: a notification is
 * an alert that something happened, and storing the only copy of a message in
 * `notificationDesc` would mean the conversation lived inside the UI element
 * announcing it.
 */
const ConversationMessageSchema = new Schema(
	{
		conversationId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Conversation',
		},

		/** always the authenticated caller; never read from the request body */
		senderId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		text: {
			type: String,
			required: true,
			trim: true,
			maxlength: 1000,
		},

		/** set when the OTHER participant opened the thread */
		readAt: {
			type: Date,
			default: null,
		},
	},
	{ timestamps: true, collection: 'conversationmessages' },
);

/** the only read that exists: one thread, oldest first */
ConversationMessageSchema.index({ conversationId: 1, createdAt: 1 });

export default ConversationMessageSchema;
