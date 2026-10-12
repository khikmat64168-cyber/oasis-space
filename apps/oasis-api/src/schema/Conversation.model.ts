import { Schema } from 'mongoose';

/**
 * One private thread between a CLIENT and an AGENT.
 *
 * Replaces the one-way Inquiry record from the first phase. An inquiry could
 * only ever be sent; there was nowhere for an answer to live, so the agent had
 * the question in a notification and no way to respond inside the product.
 *
 * Deliberately NOT the public `Message` model or the shared socket room: those
 * are one global chat with no recipient, and reusing them would publish
 * private questions to everyone connected.
 *
 * Denormalised `lastMessage*` fields exist so an inbox list is one query
 * rather than one aggregation per row. They are written in the same service
 * call that appends the message, so they cannot drift independently.
 */
const ConversationSchema = new Schema(
	{
		clientId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		agentId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		/** the plant the thread started from, when it began on a plant page */
		plantId: {
			type: Schema.Types.ObjectId,
			ref: 'Plant',
		},

		lastMessageAt: {
			type: Date,
			required: true,
			default: Date.now,
		},

		lastMessagePreview: {
			type: String,
			trim: true,
			maxlength: 160,
		},

		/** who wrote the last message, so a list can say "you:" */
		lastSenderId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},

		/* Per-side unread counters rather than a single flag: each participant
		   reads at their own pace, and one shared boolean would let whoever
		   opened the thread first clear the other's badge. */
		clientUnread: { type: Number, default: 0, min: 0 },
		agentUnread: { type: Number, default: 0, min: 0 },
	},
	{ timestamps: true, collection: 'conversations' },
);

/*
 * One thread per client/agent pair. A second question from the same client
 * continues the existing conversation instead of starting a parallel one —
 * otherwise an agent's inbox fills with single-message threads from the same
 * person and neither side can follow the history.
 */
ConversationSchema.index({ clientId: 1, agentId: 1 }, { unique: true });

/** the inbox read for either side: mine, most recently active first */
ConversationSchema.index({ clientId: 1, lastMessageAt: -1 });
ConversationSchema.index({ agentId: 1, lastMessageAt: -1 });

export default ConversationSchema;
