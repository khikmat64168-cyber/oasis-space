import { EventService } from './event.service';
import { EventStatus } from '../../libs/enums/event.enum';
import { EVENT_IMAGE_PATH } from '../../libs/dto/event/event.input';

/**
 * What the homepage relies on and the resolver cannot show: that the public
 * read never returns a hidden or finished event, and that removal keeps the
 * two-step soft-delete rule.
 */
function build(row: any = { _id: 'e1' }) {
	const eventModel: any = {
		create: jest.fn().mockResolvedValue(row),
		aggregate: jest.fn().mockReturnValue({ exec: () => Promise.resolve([{ list: [], metaCounter: [] }]) }),
		findOneAndUpdate: jest.fn().mockReturnValue({ exec: () => Promise.resolve(row) }),
		findOneAndDelete: jest.fn().mockReturnValue({ exec: () => Promise.resolve(row) }),
	};
	return { svc: new EventService(eventModel), eventModel };
}

describe('EventService.getEvents — the homepage read', () => {
	it('returns ACTIVE events from the start of today, soonest first', async () => {
		const { svc, eventModel } = build();
		await svc.getEvents({ page: 1, limit: 6 });

		const [match, sort] = eventModel.aggregate.mock.calls[0][0];
		expect(match.$match.eventStatus).toBe(EventStatus.ACTIVE);

		const from: Date = match.$match.eventDate.$gte;
		const startOfToday = new Date();
		startOfToday.setHours(0, 0, 0, 0);
		expect(from.getTime()).toBe(startOfToday.getTime());

		expect(sort.$sort).toEqual({ eventDate: 1 });
	});
});

describe('EventService.updateEventByAdmin', () => {
	it('only touches an ACTIVE event', async () => {
		const { svc, eventModel } = build();
		await svc.updateEventByAdmin({ _id: 'e1', eventTitle: 'Spring market' } as any);
		const [filter] = eventModel.findOneAndUpdate.mock.calls[0];
		expect(filter).toEqual({ _id: 'e1', eventStatus: EventStatus.ACTIVE });
	});

	it('stamps deletedAt when the event is soft-deleted', async () => {
		const { svc, eventModel } = build();
		await svc.updateEventByAdmin({ _id: 'e1', eventStatus: EventStatus.DELETE } as any);
		const [, update] = eventModel.findOneAndUpdate.mock.calls[0];
		expect(update.deletedAt).toBeInstanceOf(Date);
	});

	it('fails loudly when nothing matched', async () => {
		const { svc } = build(null);
		await expect(svc.updateEventByAdmin({ _id: 'missing' } as any)).rejects.toThrow();
	});
});

describe('EventService.removeEventByAdmin', () => {
	it('removes only an event already set to DELETE', async () => {
		const { svc, eventModel } = build();
		await svc.removeEventByAdmin('e1' as any);
		const [filter] = eventModel.findOneAndDelete.mock.calls[0];
		expect(filter).toEqual({ _id: 'e1', eventStatus: EventStatus.DELETE });
	});

	it('fails loudly on an ACTIVE or missing event', async () => {
		const { svc } = build(null);
		await expect(svc.removeEventByAdmin('e1' as any)).rejects.toThrow();
	});
});

describe('EVENT_IMAGE_PATH', () => {
	it('accepts what imageUploader returns for the event target', () => {
		expect(EVENT_IMAGE_PATH.test('uploads/event/3f2b9c1e-8d4a-4b6f-9a1e-0c2d3e4f5a6b.webp')).toBe(true);
	});

	it('rejects outside URLs, other folders and traversal', () => {
		expect(EVENT_IMAGE_PATH.test('https://example.com/a.png')).toBe(false);
		expect(EVENT_IMAGE_PATH.test('uploads/plant/3f2b9c1e.png')).toBe(false);
		expect(EVENT_IMAGE_PATH.test('uploads/event/../member/a.png')).toBe(false);
	});
});
