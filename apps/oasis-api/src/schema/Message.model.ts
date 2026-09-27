import { Schema } from 'mongoose';

// A single line of the Oasis Space live chat. The chat is one shared public
// room (there is no conversation/thread entity), so a message only needs its
// author and its text — history is read back newest-first and replayed to
// whoever connects.
const MessageSchema = new Schema(
	{
		memberId: {
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
	},
	{ timestamps: true, collection: 'messages' },
);

MessageSchema.index({ createdAt: -1 });

export default MessageSchema;
