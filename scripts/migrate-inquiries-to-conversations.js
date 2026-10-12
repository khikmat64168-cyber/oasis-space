/*
 * Carry first-phase inquiries forward into conversations.
 *
 * Phase one stored a client's question as a one-way `Inquiry` with no way for
 * the agent to answer. Conversations replace that. Every existing inquiry
 * becomes the first message of a thread between the same two members, so no
 * question a client actually sent is lost or left unanswerable.
 *
 * Safety:
 *  - Idempotent. A thread is matched on the client/agent pair and a message on
 *    its original inquiry id, so running this twice changes nothing.
 *  - Non-destructive. Nothing is deleted: the `inquiries` collection, the old
 *    notifications and their `inquiryId` links all stay exactly as they are.
 *  - Old notifications are given a `conversationId` as well, so clicking one
 *    written before this migration opens the right thread. Their `inquiryId`
 *    is left in place.
 *
 * Run with --apply to write; without it, it only reports.
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const PREVIEW_LENGTH = 140;

(async () => {
	const uri = process.env.MONGO_DEV;
	if (!uri) throw new Error('MONGO_DEV is not set');
	await mongoose.connect(uri);
	const db = mongoose.connection.db;

	const inquiries = await db.collection('inquiries').find({}).sort({ createdAt: 1 }).toArray();
	console.log(`inquiries to carry forward: ${inquiries.length}`);
	if (!inquiries.length) {
		await mongoose.disconnect();
		return;
	}

	let threadsCreated = 0;
	let messagesCreated = 0;
	let notificationsLinked = 0;
	let skipped = 0;

	for (const inquiry of inquiries) {
		// the message carries its origin, which is also what makes this idempotent
		const already = await db.collection('conversationmessages').findOne({ fromInquiryId: inquiry._id });
		if (already) {
			skipped += 1;
			continue;
		}

		console.log(`  ${inquiry._id}: ${String(inquiry.message).slice(0, 60)}`);
		if (!APPLY) continue;

		const preview =
			inquiry.message.length > PREVIEW_LENGTH
				? `${inquiry.message.slice(0, PREVIEW_LENGTH).trimEnd()}…`
				: inquiry.message;

		const existing = await db
			.collection('conversations')
			.findOne({ clientId: inquiry.senderId, agentId: inquiry.recipientId });

		let conversationId;
		if (existing) {
			conversationId = existing._id;
			// only move the thread forward if this inquiry is actually newer
			if (!existing.lastMessageAt || existing.lastMessageAt < inquiry.createdAt) {
				await db.collection('conversations').updateOne(
					{ _id: conversationId },
					{
						$set: {
							lastMessageAt: inquiry.createdAt,
							lastMessagePreview: preview,
							lastSenderId: inquiry.senderId,
						},
						$inc: { agentUnread: 1 },
					},
				);
			}
		} else {
			const inserted = await db.collection('conversations').insertOne({
				clientId: inquiry.senderId,
				agentId: inquiry.recipientId,
				...(inquiry.plantId ? { plantId: inquiry.plantId } : {}),
				lastMessageAt: inquiry.createdAt,
				lastMessagePreview: preview,
				lastSenderId: inquiry.senderId,
				clientUnread: 0,
				// the agent never had a way to read it, so it is still unread
				agentUnread: 1,
				createdAt: inquiry.createdAt,
				updatedAt: inquiry.updatedAt ?? inquiry.createdAt,
			});
			conversationId = inserted.insertedId;
			threadsCreated += 1;
		}

		await db.collection('conversationmessages').insertOne({
			conversationId,
			senderId: inquiry.senderId,
			text: inquiry.message,
			readAt: null,
			// provenance, and the idempotency key for this script
			fromInquiryId: inquiry._id,
			createdAt: inquiry.createdAt,
			updatedAt: inquiry.updatedAt ?? inquiry.createdAt,
		});
		messagesCreated += 1;

		const linked = await db
			.collection('notifications')
			.updateMany(
				{ inquiryId: inquiry._id, conversationId: { $exists: false } },
				{ $set: { conversationId } },
			);
		notificationsLinked += linked.modifiedCount ?? 0;
	}

	if (!APPLY) {
		console.log(`\n${skipped} already migrated. DRY RUN — nothing written. Re-run with --apply.`);
	} else {
		console.log(
			`\nthreads created: ${threadsCreated}  messages created: ${messagesCreated}  ` +
				`notifications linked: ${notificationsLinked}  already migrated: ${skipped}`,
		);
	}

	await mongoose.disconnect();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
