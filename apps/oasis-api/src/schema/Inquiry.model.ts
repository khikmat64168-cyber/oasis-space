import { Schema } from 'mongoose';

/**
 * One question a CLIENT sent to an AGENT.
 *
 * This is the durable record. The agent also receives a Notification pointing
 * at it, but the notification is not the storage: a notification belongs to
 * its receiver alone, so the sender would keep no copy of what they wrote and
 * an ADMIN — who is allowed to see inquiries — could not read it at all.
 *
 * Deliberately NOT a conversation. There is no thread, no reply, and no
 * participants array, because none of that is built yet. The shape is chosen
 * so a later Conversation/Message phase can migrate these rows forward
 * (sender + recipient + text + timestamp is the minimum a first message
 * needs) rather than having to discard them.
 */
const InquirySchema = new Schema(
	{
		/** always the authenticated caller; never taken from the request body */
		senderId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
			index: true,
		},

		/** must be an ACTIVE member of type AGENT, checked in the service */
		recipientId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
			index: true,
		},

		message: {
			type: String,
			required: true,
			trim: true,
			maxlength: 1000,
		},

		/**
		 * The plant the question came from, when it was asked on a plant page.
		 * Absent when asked from the agent's profile, which is not about one
		 * plant — so this is optional rather than defaulted to something false.
		 */
		plantId: {
			type: Schema.Types.ObjectId,
			ref: 'Plant',
		},
	},
	{ timestamps: true, collection: 'inquiries' },
);

/** the two reads that exist: what I received, and what I sent — newest first */
InquirySchema.index({ recipientId: 1, createdAt: -1 });
InquirySchema.index({ senderId: 1, createdAt: -1 });

export default InquirySchema;
