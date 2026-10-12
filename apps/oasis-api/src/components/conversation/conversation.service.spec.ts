import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { MemberStatus, MemberType } from '../../libs/enums/member.enums';
import { NotificationType } from '../../libs/enums/notification.enum';

const AGENT = 'agent-1';
const OTHER_AGENT = 'agent-2';
const CLIENT = 'client-1';
const OTHER_CLIENT = 'client-2';

const eq = (a: any, b: any) => String(a) === String(b);

/** Matches only the operators the service actually uses. */
const matches = (row: any, filter: any): boolean =>
	Object.entries(filter).every(([key, value]: [string, any]) => {
		if (key === '$or') return (value as any[]).some((f) => matches(row, f));
		if (value && typeof value === 'object' && '$gt' in value) return row[key] > value.$gt;
		if (value && typeof value === 'object' && '$ne' in value) return !eq(row[key], value.$ne);
		if (value === null) return row[key] === null || row[key] === undefined;
		return eq(row[key], value);
	});

const applyUpdate = (row: any, update: any) => {
	if (update.$set) Object.assign(row, update.$set);
	if (update.$setOnInsert) for (const [k, v] of Object.entries(update.$setOnInsert)) if (!(k in row)) row[k] = v;
	if (update.$inc) for (const [k, v] of Object.entries(update.$inc)) row[k] = (row[k] ?? 0) + (v as number);
};

class FakeCollection {
	public rows: any[] = [];
	private seq = 0;
	constructor(private readonly prefix: string) {}

	create(doc: any) {
		const row = { _id: `${this.prefix}${++this.seq}`, createdAt: new Date(), readAt: null, ...doc };
		this.rows.push(row);
		return Promise.resolve(row);
	}
	findOne(filter: any) {
		return { exec: () => Promise.resolve(this.rows.find((r) => matches(r, filter)) ?? null) };
	}
	findById(id: any) {
		return { exec: () => Promise.resolve(this.rows.find((r) => eq(r._id, id)) ?? null) };
	}
	findOneAndUpdate(filter: any, update: any, opts: any = {}) {
		let row = this.rows.find((r) => matches(r, filter));
		if (!row && opts.upsert) {
			row = { _id: `${this.prefix}${++this.seq}`, createdAt: new Date() };
			applyUpdate(row, update);
			this.rows.push(row);
		} else if (row) {
			applyUpdate(row, update);
		}
		return { exec: () => Promise.resolve(row ?? null) };
	}
	updateOne(filter: any, update: any) {
		const row = this.rows.find((r) => matches(r, filter));
		if (row) applyUpdate(row, update);
		return { exec: () => Promise.resolve({ modifiedCount: row ? 1 : 0 }) };
	}
	updateMany(filter: any, update: any) {
		const hits = this.rows.filter((r) => matches(r, filter));
		hits.forEach((r) => applyUpdate(r, update));
		return { exec: () => Promise.resolve({ modifiedCount: hits.length }) };
	}
	/** Supports the two shapes the service builds: $match/$sort/$facet and $match/$addFields. */
	aggregate(pipeline: any[]) {
		let rows = this.rows.filter((r) => matches(r, pipeline[0].$match));
		const facet = pipeline.find((s) => s.$facet);
		if (facet) {
			const sort = pipeline.find((s) => s.$sort)?.$sort;
			if (sort) {
				const [[key, dir]] = Object.entries(sort) as [string, number][];
				rows = [...rows].sort((a, b) => (a[key] > b[key] ? dir : a[key] < b[key] ? -dir : 0));
			}
			return {
				exec: () =>
					Promise.resolve([{ list: rows, metaCounter: rows.length ? [{ total: rows.length }] : [] }]),
			};
		}
		return { exec: () => Promise.resolve(rows.map((r) => ({ ...r }))) };
	}
}

class FakeMemberModel {
	constructor(private readonly members: Record<string, any>) {}
	findById(id: any) {
		const doc = this.members[String(id)] ?? null;
		return { select: () => ({ lean: () => ({ exec: () => Promise.resolve(doc) }) }) };
	}
}

describe('ConversationService', () => {
	let conversations: FakeCollection;
	let messages: FakeCollection;
	let notifications: { record: jest.Mock };
	let service: ConversationService;

	const build = (overrides: Record<string, any> = {}) => {
		conversations = new FakeCollection('conv');
		messages = new FakeCollection('msg');
		notifications = { record: jest.fn().mockResolvedValue(undefined) };
		const memberModel = new FakeMemberModel({
			[AGENT]: { memberType: MemberType.AGENT, memberStatus: MemberStatus.ACTIVE, memberNick: 'grower' },
			[OTHER_AGENT]: { memberType: MemberType.AGENT, memberStatus: MemberStatus.ACTIVE, memberNick: 'rival' },
			[CLIENT]: { memberType: MemberType.CLIENT, memberStatus: MemberStatus.ACTIVE, memberNick: 'buyer' },
			[OTHER_CLIENT]: { memberType: MemberType.CLIENT, memberStatus: MemberStatus.ACTIVE, memberNick: 'nosy' },
			...overrides,
		});
		service = new ConversationService(
			conversations as any,
			messages as any,
			memberModel as any,
			notifications as any,
		);
		// ids in this suite are plain strings, not ObjectIds
		(service as any).toObjectId = (v: string) => {
			if (!v || v === 'bad-id') throw new BadRequestException('INVALID');
			return v;
		};
	};

	beforeEach(() => build());

	const start = (text = 'Do you deliver to Busan?') =>
		service.startConversation(CLIENT as any, { agentId: AGENT, text });

	describe('starting a thread', () => {
		it('creates the conversation and its first message', async () => {
			await start();

			expect(conversations.rows).toHaveLength(1);
			expect(messages.rows).toHaveLength(1);
			expect(eq(messages.rows[0].senderId, CLIENT)).toBe(true);
			expect(messages.rows[0].text).toBe('Do you deliver to Busan?');
		});

		it('reuses the thread when the same client writes again', async () => {
			await start('First question');
			await start('Second question');

			expect(conversations.rows).toHaveLength(1);
			expect(messages.rows).toHaveLength(2);
		});

		it('raises the agent badge, never the sender own', async () => {
			await start();

			expect(conversations.rows[0].agentUnread).toBe(1);
			expect(conversations.rows[0].clientUnread).toBe(0);
		});

		it('notifies the agent with a preview, not the whole message', async () => {
			const long = 'x'.repeat(400);
			await start(long);

			const [[drafts]] = notifications.record.mock.calls;
			expect(drafts[0].notificationType).toBe(NotificationType.AGENT_INQUIRY);
			expect(eq(drafts[0].receiverId, AGENT)).toBe(true);
			expect(drafts[0].conversationId).toBeDefined();
			expect(drafts[0].notificationDesc.length).toBeLessThan(long.length);
		});

		it('rejects an empty message', async () => {
			await expect(service.startConversation(CLIENT as any, { agentId: AGENT, text: '   ' })).rejects.toBeInstanceOf(
				BadRequestException,
			);
			expect(messages.rows).toHaveLength(0);
		});

		it('rejects a recipient who is not an agent', async () => {
			await expect(
				service.startConversation(CLIENT as any, { agentId: OTHER_CLIENT, text: 'hello' }),
			).rejects.toBeInstanceOf(BadRequestException);
		});

		it('rejects an agent who is not active', async () => {
			build({ [AGENT]: { memberType: MemberType.AGENT, memberStatus: MemberStatus.BLOCK } });
			await expect(start()).rejects.toBeInstanceOf(BadRequestException);
		});

		it('rejects an unknown recipient', async () => {
			await expect(
				service.startConversation(CLIENT as any, { agentId: 'nobody', text: 'hello' }),
			).rejects.toBeInstanceOf(NotFoundException);
		});

		it('rejects writing to yourself', async () => {
			await expect(
				service.startConversation(CLIENT as any, { agentId: CLIENT, text: 'hello me' }),
			).rejects.toBeInstanceOf(BadRequestException);
		});

		it('collapses a double submission', async () => {
			await start('Same text');
			await start('Same text');

			expect(messages.rows).toHaveLength(1);
			expect(notifications.record).toHaveBeenCalledTimes(1);
		});
	});

	describe('replying', () => {
		let id: string;
		beforeEach(async () => {
			const conv: any = await start();
			id = conv._id;
			notifications.record.mockClear();
		});

		it('lets the agent answer in the same thread', async () => {
			await service.sendMessage(AGENT as any, { conversationId: id, text: 'Yes, within three days.' });

			expect(messages.rows).toHaveLength(2);
			expect(eq(messages.rows[1].senderId, AGENT)).toBe(true);
			expect(eq(messages.rows[1].conversationId, id)).toBe(true);
		});

		it('notifies the client of a reply, with the reply type', async () => {
			await service.sendMessage(AGENT as any, { conversationId: id, text: 'Yes we do' });

			const [[drafts]] = notifications.record.mock.calls;
			expect(drafts[0].notificationType).toBe(NotificationType.AGENT_REPLY);
			expect(eq(drafts[0].receiverId, CLIENT)).toBe(true);
			expect(eq(drafts[0].conversationId, id)).toBe(true);
		});

		it('raises the client badge on a reply', async () => {
			await service.sendMessage(AGENT as any, { conversationId: id, text: 'Yes we do' });
			expect(conversations.rows[0].clientUnread).toBe(1);
		});

		it('lets the client answer back', async () => {
			await service.sendMessage(AGENT as any, { conversationId: id, text: 'Yes we do' });
			await service.sendMessage(CLIENT as any, { conversationId: id, text: 'Great, thank you' });

			expect(messages.rows).toHaveLength(3);
			expect(messages.rows.map((m) => String(m.senderId))).toEqual([CLIENT, AGENT, CLIENT]);
		});

		it('refuses a non-participant agent', async () => {
			await expect(
				service.sendMessage(OTHER_AGENT as any, { conversationId: id, text: 'butting in' }),
			).rejects.toBeInstanceOf(ForbiddenException);
			expect(messages.rows).toHaveLength(1);
		});

		it('refuses a non-participant client', async () => {
			await expect(
				service.sendMessage(OTHER_CLIENT as any, { conversationId: id, text: 'butting in' }),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('refuses an empty reply', async () => {
			await expect(service.sendMessage(AGENT as any, { conversationId: id, text: '  ' })).rejects.toBeInstanceOf(
				BadRequestException,
			);
		});

		it('refuses an unknown conversation', async () => {
			await expect(
				service.sendMessage(AGENT as any, { conversationId: 'nope', text: 'hello' }),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});

	describe('reading', () => {
		let id: string;
		beforeEach(async () => {
			const conv: any = await start();
			id = conv._id;
		});

		it('returns the thread in chronological order', async () => {
			await service.sendMessage(AGENT as any, { conversationId: id, text: 'Reply one' });
			await service.sendMessage(CLIENT as any, { conversationId: id, text: 'Reply two' });

			const result = await service.getMessages(CLIENT as any, { conversationId: id, page: 1, limit: 50 });
			expect(result.list.map((m: any) => m.text)).toEqual([
				'Do you deliver to Busan?',
				'Reply one',
				'Reply two',
			]);
		});

		it('clears only the reader own badge', async () => {
			await service.sendMessage(AGENT as any, { conversationId: id, text: 'Reply' });
			// client has 1 unread, agent has 1 unread from the opening message
			await service.getMessages(CLIENT as any, { conversationId: id, page: 1, limit: 50 });

			expect(conversations.rows[0].clientUnread).toBe(0);
			expect(conversations.rows[0].agentUnread).toBe(1);
		});

		it('marks the other side messages read, never your own', async () => {
			await service.sendMessage(AGENT as any, { conversationId: id, text: 'Reply' });
			await service.getMessages(CLIENT as any, { conversationId: id, page: 1, limit: 50 });

			const own = messages.rows.find((m) => eq(m.senderId, CLIENT));
			const theirs = messages.rows.find((m) => eq(m.senderId, AGENT));
			expect(own.readAt).toBeNull();
			expect(theirs.readAt).toBeInstanceOf(Date);
		});

		it('refuses a non-participant reading the thread', async () => {
			await expect(
				service.getMessages(OTHER_CLIENT as any, { conversationId: id, page: 1, limit: 50 }),
			).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('refuses a non-participant reading the header', async () => {
			await expect(service.getConversation(OTHER_AGENT as any, id as any)).rejects.toBeInstanceOf(
				ForbiddenException,
			);
		});

		it('lists the thread for both participants and nobody else', async () => {
			const mine = await service.getMyConversations(CLIENT as any, { page: 1, limit: 10 });
			const theirs = await service.getMyConversations(AGENT as any, { page: 1, limit: 10 });
			const stranger = await service.getMyConversations(OTHER_CLIENT as any, { page: 1, limit: 10 });

			expect(mine.list).toHaveLength(1);
			expect(theirs.list).toHaveLength(1);
			expect(stranger.list).toHaveLength(0);
		});

		it('refuses a non-participant marking it read', async () => {
			await expect(service.markConversationRead(OTHER_CLIENT as any, id as any)).rejects.toBeInstanceOf(
				ForbiddenException,
			);
		});
	});
});
