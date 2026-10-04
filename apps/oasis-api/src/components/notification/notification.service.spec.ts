import { NotificationService } from './notification.service';
import { NotificationType } from '../../libs/enums/notification.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enums';

const ADMIN_A = 'adminA';
const ADMIN_B = 'adminB';

function build(admins: any[] = []) {
	const notificationModel: any = { insertMany: jest.fn().mockResolvedValue([]) };
	const memberModel: any = {
		find: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(admins) }) }),
	};
	return { svc: new NotificationService(notificationModel, memberModel), notificationModel, memberModel };
}

const draft = (over: any = {}) => ({
	receiverId: 'someone',
	notificationType: NotificationType.ORDER_CONFIRMED,
	notificationTitle: 'Order confirmed',
	...over,
});

describe('NotificationService.record', () => {
	it('drops a draft whose receiver is also its sender', async () => {
		const { svc, notificationModel } = build();
		await svc.record([draft({ receiverId: 'bob', senderId: 'bob' })] as any);
		expect(notificationModel.insertMany).not.toHaveBeenCalled();
	});

	it('keeps a draft with no sender at all', async () => {
		// the customer's own ORDER_CREATED receipt has no sender; dropping it
		// would silently lose the one notification the buyer actually wants
		const { svc, notificationModel } = build();
		await svc.record([draft({ receiverId: 'bob', senderId: undefined })] as any);
		expect(notificationModel.insertMany).toHaveBeenCalledTimes(1);
		expect(notificationModel.insertMany.mock.calls[0][0]).toHaveLength(1);
	});

	it('keeps the others when one draft is self-addressed', async () => {
		const { svc, notificationModel } = build();
		await svc.record([
			draft({ receiverId: 'bob', senderId: 'bob' }),
			draft({ receiverId: 'ann', senderId: 'bob' }),
		] as any);
		const [written] = notificationModel.insertMany.mock.calls[0];
		expect(written.map((w: any) => w.receiverId)).toEqual(['ann']);
	});

	it('compares ids by value, not by reference', async () => {
		// ObjectId instances are never === each other, so a naive check would
		// let every self-notification through
		const { svc, notificationModel } = build();
		const id = (v: string) => ({ toString: () => v });
		await svc.record([draft({ receiverId: id('x1'), senderId: id('x1') })] as any);
		expect(notificationModel.insertMany).not.toHaveBeenCalled();
	});

	it('never throws when the write fails', async () => {
		const { svc, notificationModel } = build();
		notificationModel.insertMany.mockRejectedValueOnce(new Error('mongo down'));
		await expect(svc.record([draft({ senderId: 'other' })] as any)).resolves.toBeUndefined();
	});
});

describe('NotificationService.activeAdminIds', () => {
	it('asks only for ACTIVE admins', async () => {
		const { svc, memberModel } = build([{ _id: ADMIN_A }]);
		await svc.activeAdminIds();
		expect(memberModel.find).toHaveBeenCalledWith(
			{ memberType: MemberType.ADMIN, memberStatus: MemberStatus.ACTIVE },
			{ _id: 1 },
		);
	});

	it('returns every admin, not just the first', async () => {
		const { svc } = build([{ _id: ADMIN_A }, { _id: ADMIN_B }]);
		await expect(svc.activeAdminIds()).resolves.toEqual([ADMIN_A, ADMIN_B]);
	});

	it('returns an empty list rather than throwing when the lookup fails', async () => {
		// an unreachable member collection must not take the order down with it
		const { svc, memberModel } = build();
		memberModel.find = jest.fn(() => {
			throw new Error('mongo down');
		});
		await expect(svc.activeAdminIds()).resolves.toEqual([]);
	});
});
