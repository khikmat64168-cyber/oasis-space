import { OrderService } from './order.service';
import { OrderStatus, OrderItemType } from '../../libs/enums/order.enum';
import { NotificationType } from '../../libs/enums/notification.enum';
import { MemberType } from '../../libs/enums/member.enums';
import { Message } from '../../libs/Errors';

const OID = (n: number) => n.toString(16).padStart(24, '0');
const PLANT_ID = OID(1);
const ACC_ID = OID(2);
const ORDER_ID = OID(3);
const ITEM_ID = OID(4);
const AGENT = 'agentA';
const AGENT2 = 'agentB';
const CUSTOMER = 'customer1';
const OTHER = 'stranger9';
const ADMIN = 'admin1';

const makeItem = (over: Partial<any> = {}) => ({
	_id: ITEM_ID,
	itemStatus: OrderStatus.PENDING,
	agentId: AGENT,
	customerId: CUSTOMER,
	...over,
});

function build({ order, item, plant, accessory }: any = {}) {
	const orderModel: any = {
		create: jest.fn().mockResolvedValue({ _id: ORDER_ID }),
		findById: jest.fn().mockReturnValue({ exec: () => Promise.resolve(order) }),
		findByIdAndDelete: jest.fn().mockReturnValue({ exec: () => Promise.resolve(true) }),
		aggregate: jest.fn().mockReturnValue({ exec: () => Promise.resolve([order ?? { _id: ORDER_ID, items: [] }]) }),
	};
	const orderItemModel: any = {
		insertMany: jest.fn().mockResolvedValue([{ _id: ITEM_ID }]),
		find: jest.fn().mockReturnValue({ exec: () => Promise.resolve(item ? [item] : []) }),
		findById: jest.fn().mockReturnValue({ exec: () => Promise.resolve(item) }),
		findByIdAndUpdate: jest.fn().mockReturnValue({ exec: () => Promise.resolve(item) }),
		updateMany: jest.fn().mockReturnValue({ exec: () => Promise.resolve({ modifiedCount: 1 }) }),
		aggregate: jest.fn().mockReturnValue({ exec: () => Promise.resolve([item ?? { _id: ITEM_ID }]) }),
	};
	const eventModel: any = { insertMany: jest.fn().mockResolvedValue([]) };
	const plantModel: any = {
		findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(plant) }) }),
		findByIdAndUpdate: jest.fn().mockReturnValue({ exec: () => Promise.resolve(true) }),
	};
	const accessoryModel: any = {
		findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(accessory) }) }),
		findByIdAndUpdate: jest.fn().mockReturnValue({ exec: () => Promise.resolve(true) }),
	};
	// notifications are a side record of an order: the service records them but
	// never depends on the result, so a spy is enough to assert who was told.
	const notificationService: any = {
		record: jest.fn().mockResolvedValue(undefined),
		// one admin, matching production; the fan-out is exercised, not stubbed away
		activeAdminIds: jest.fn().mockResolvedValue([ADMIN]),
	};
	return {
		svc: new OrderService(orderModel, orderItemModel, eventModel, plantModel, accessoryModel, notificationService),
		notificationService,
		orderModel,
		orderItemModel,
		eventModel,
		plantModel,
		accessoryModel,
	};
}

describe('OrderService.createOrder — cart', () => {
	const future = new Date(Date.now() + 7 * 864e5).toISOString();

	it('derives agent, unitPrice, itemTotal + orderTotal from the product; items start PENDING', async () => {
		const { svc, orderModel, orderItemModel } = build({ plant: { _id: PLANT_ID, memberId: AGENT, plantPrice: 100, plantStock: 50 } });
		const input: any = {
			deliveryAddress: 'Seoul, Gangnam 1',
			items: [{ itemType: OrderItemType.PLANT, refId: PLANT_ID, itemQuantity: 2, installationDate: future }],
		};
		await svc.createOrder(CUSTOMER as any, input);
		expect(orderModel.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: CUSTOMER, orderTotal: 200 }));
		const items = orderItemModel.insertMany.mock.calls[0][0];
		expect(items[0]).toEqual(
			expect.objectContaining({ agentId: AGENT, unitPrice: 100, itemTotal: 200, itemStatus: OrderStatus.PENDING }),
		);
	});

	it('supports accessory line items (agent + price from the accessory)', async () => {
		const { svc, orderItemModel } = build({ accessory: { _id: ACC_ID, memberId: AGENT2, accessoryPrice: 25, accessoryStock: 50 } });
		const input: any = {
			deliveryAddress: 'Seoul, Gangnam 1',
			items: [{ itemType: OrderItemType.ACCESSORY, refId: ACC_ID, itemQuantity: 4 }],
		};
		await svc.createOrder(CUSTOMER as any, input);
		expect(orderItemModel.insertMany.mock.calls[0][0][0]).toEqual(
			expect.objectContaining({ agentId: AGENT2, unitPrice: 25, itemTotal: 100 }),
		);
	});

	it('rejects when a product does not exist / is not active', async () => {
		const { svc } = build({ plant: null });
		const input: any = { deliveryAddress: 'Seoul, Gangnam 1', items: [{ itemType: OrderItemType.PLANT, refId: PLANT_ID }] };
		await expect(svc.createOrder(CUSTOMER as any, input)).rejects.toThrow(Message.NO_DATA_FOUND);
	});

	it('rejects a past installation date', async () => {
		const { svc } = build({ plant: { _id: PLANT_ID, memberId: AGENT, plantPrice: 100, plantStock: 50 } });
		const input: any = {
			deliveryAddress: 'Seoul, Gangnam 1',
			items: [{ itemType: OrderItemType.PLANT, refId: PLANT_ID, installationDate: '2020-01-01T00:00:00.000Z' }],
		};
		await expect(svc.createOrder(CUSTOMER as any, input)).rejects.toThrow(Message.INVALID_INSTALLATION_DATE);
	});
});

describe('OrderService.updateOrderItemStatus — advance', () => {
	const upd = (to: OrderStatus): any => ({ itemId: ITEM_ID, orderStatus: to });

	it('agent(owner) advances PENDING -> CONFIRMED', async () => {
		const { svc, orderItemModel } = build({ item: makeItem({ itemStatus: OrderStatus.PENDING }) });
		await svc.updateOrderItemStatus(AGENT as any, MemberType.AGENT, upd(OrderStatus.CONFIRMED));
		expect(orderItemModel.findByIdAndUpdate).toHaveBeenCalledWith(
			expect.anything(),
			{ itemStatus: OrderStatus.CONFIRMED },
			expect.anything(),
		);
	});

	it('rejects an illegal jump PENDING -> IN_TRANSIT', async () => {
		const { svc } = build({ item: makeItem({ itemStatus: OrderStatus.PENDING }) });
		await expect(svc.updateOrderItemStatus(AGENT as any, MemberType.AGENT, upd(OrderStatus.IN_TRANSIT))).rejects.toThrow(
			Message.INVALID_ORDER_TRANSITION,
		);
	});

	it('does NOT allow CANCELLED here (must use cancelOrderItem)', async () => {
		const { svc } = build({ item: makeItem({ itemStatus: OrderStatus.PENDING }) });
		await expect(svc.updateOrderItemStatus(AGENT as any, MemberType.AGENT, upd(OrderStatus.CANCELLED))).rejects.toThrow(
			Message.INVALID_ORDER_TRANSITION,
		);
	});

	it('forbids a non-owner agent', async () => {
		const { svc } = build({ item: makeItem({ itemStatus: OrderStatus.PENDING, agentId: AGENT }) });
		await expect(svc.updateOrderItemStatus(AGENT2 as any, MemberType.AGENT, upd(OrderStatus.CONFIRMED))).rejects.toThrow(
			Message.NOT_YOUR_ORDER,
		);
	});
});

describe('OrderService — notifications', () => {
	// record() is mocked here, so these assert WHICH drafts the order flow
	// builds. The rule that a member is never notified of their own action
	// lives in NotificationService.record and is covered in its own spec.
	const typesFor = (drafts: any[], receiverId: string) =>
		drafts.filter((d) => d.receiverId === receiverId).map((d) => d.notificationType);

	it('on a new order tells the customer, the supplying agent and the admin', async () => {
		const { svc, notificationService } = build({
			plant: { _id: PLANT_ID, memberId: AGENT, plantPrice: 100, plantStock: 50, plantName: 'Oak 1' },
		});
		await svc.createOrder(CUSTOMER as any, {
			deliveryAddress: 'Seoul, Gangnam 1',
			items: [{ itemType: OrderItemType.PLANT, refId: PLANT_ID, itemQuantity: 2 }],
		} as any);

		expect(notificationService.record).toHaveBeenCalledTimes(1);
		const [drafts] = notificationService.record.mock.calls[0];

		expect(typesFor(drafts, CUSTOMER)).toEqual([NotificationType.ORDER_CREATED]);
		expect(typesFor(drafts, AGENT)).toEqual([NotificationType.NEW_ORDER]);
		expect(typesFor(drafts, ADMIN)).toEqual([NotificationType.NEW_ORDER]);

		// the customer's own receipt must carry no sender, or record() would
		// drop it as a self-notification
		expect(drafts.find((d: any) => d.receiverId === CUSTOMER).senderId).toBeUndefined();
		// the agent is told what was ordered, not just that something was
		expect(drafts.find((d: any) => d.receiverId === AGENT).notificationDesc).toContain('Oak 1');
	});

	it('writes one notification per agent, not one per line', async () => {
		const { svc, notificationService } = build({
			plant: { _id: PLANT_ID, memberId: AGENT, plantPrice: 100, plantStock: 50, plantName: 'Oak 1' },
		});
		await svc.createOrder(CUSTOMER as any, {
			deliveryAddress: 'Seoul, Gangnam 1',
			items: [
				{ itemType: OrderItemType.PLANT, refId: PLANT_ID, itemQuantity: 1 },
				{ itemType: OrderItemType.PLANT, refId: PLANT_ID, itemQuantity: 2 },
			],
		} as any);
		const [drafts] = notificationService.record.mock.calls[0];
		expect(typesFor(drafts, AGENT)).toHaveLength(1);
	});

	it.each([
		[OrderStatus.CONFIRMED, NotificationType.ORDER_CONFIRMED],
		[OrderStatus.IN_TRANSIT, NotificationType.ORDER_IN_TRANSIT],
		[OrderStatus.INSTALLED, NotificationType.ORDER_INSTALLED],
	])('maps the %s transition to %s for the customer and the admin', async (to, expected) => {
		const from = {
			[OrderStatus.CONFIRMED]: OrderStatus.PENDING,
			[OrderStatus.IN_TRANSIT]: OrderStatus.CONFIRMED,
			[OrderStatus.INSTALLED]: OrderStatus.IN_TRANSIT,
		}[to as string];
		const { svc, notificationService } = build({
			item: makeItem({ itemStatus: from, customerId: CUSTOMER, agentId: AGENT }),
		});
		await svc.updateOrderItemStatus(AGENT as any, MemberType.AGENT, { itemId: ITEM_ID, orderStatus: to } as any);

		const [drafts] = notificationService.record.mock.calls[0];
		expect(typesFor(drafts, CUSTOMER)).toEqual([expected]);
		expect(typesFor(drafts, ADMIN)).toEqual([expected]);
	});

	it('does not tell an agent about a transition the agent made themselves', async () => {
		const { svc, notificationService } = build({
			item: makeItem({ itemStatus: OrderStatus.PENDING, customerId: CUSTOMER, agentId: AGENT }),
		});
		await svc.updateOrderItemStatus(AGENT as any, MemberType.AGENT, {
			itemId: ITEM_ID,
			orderStatus: OrderStatus.CONFIRMED,
		} as any);
		const [drafts] = notificationService.record.mock.calls[0];
		expect(typesFor(drafts, AGENT)).toEqual([]);
	});

	it('tells the agent when an ADMIN moves their line', async () => {
		const { svc, notificationService } = build({
			item: makeItem({ itemStatus: OrderStatus.PENDING, customerId: CUSTOMER, agentId: AGENT }),
		});
		await svc.updateOrderItemStatus(ADMIN as any, MemberType.ADMIN, {
			itemId: ITEM_ID,
			orderStatus: OrderStatus.CONFIRMED,
		} as any);
		const [drafts] = notificationService.record.mock.calls[0];
		expect(typesFor(drafts, AGENT)).toEqual([NotificationType.ORDER_DELIVERY_UPDATE]);
	});

	it('treats an agent cancelling a still-PENDING line as a rejection', async () => {
		const { svc, notificationService } = build({
			item: makeItem({ itemStatus: OrderStatus.PENDING, customerId: CUSTOMER, agentId: AGENT }),
		});
		await svc.cancelOrderItem(AGENT as any, MemberType.AGENT, ITEM_ID as any);
		const [drafts] = notificationService.record.mock.calls[0];
		expect(typesFor(drafts, CUSTOMER)).toEqual([NotificationType.ORDER_REJECTED]);
		expect(typesFor(drafts, ADMIN)).toEqual([NotificationType.ORDER_REJECTED]);
	});

	it('treats an agent cancelling an accepted line as a cancellation, not a rejection', async () => {
		const { svc, notificationService } = build({
			item: makeItem({ itemStatus: OrderStatus.IN_TRANSIT, customerId: CUSTOMER, agentId: AGENT }),
		});
		await svc.cancelOrderItem(AGENT as any, MemberType.AGENT, ITEM_ID as any);
		const [drafts] = notificationService.record.mock.calls[0];
		expect(typesFor(drafts, CUSTOMER)).toEqual([NotificationType.ORDER_CANCELLED]);
	});

	it('tells the agent, in their own words, when the client cancels', async () => {
		const { svc, notificationService } = build({
			item: makeItem({ itemStatus: OrderStatus.PENDING, customerId: CUSTOMER, agentId: AGENT }),
		});
		await svc.cancelOrderItem(CUSTOMER as any, MemberType.CLIENT, ITEM_ID as any);
		const [drafts] = notificationService.record.mock.calls[0];
		expect(typesFor(drafts, AGENT)).toEqual([NotificationType.ORDER_CANCELLED_BY_CLIENT]);
		expect(typesFor(drafts, ADMIN)).toEqual([NotificationType.ORDER_CANCELLED]);
		// the one who pressed cancel is not told about it
		expect(typesFor(drafts, CUSTOMER)).toEqual([]);
	});

	it('tells both sides when an ADMIN cancels a line', async () => {
		const { svc, notificationService } = build({
			item: makeItem({ itemStatus: OrderStatus.CONFIRMED, customerId: CUSTOMER, agentId: AGENT }),
		});
		await svc.cancelOrderItem(ADMIN as any, MemberType.ADMIN, ITEM_ID as any);
		const [drafts] = notificationService.record.mock.calls[0];
		expect(typesFor(drafts, CUSTOMER)).toEqual([NotificationType.ORDER_CANCELLED]);
		expect(typesFor(drafts, AGENT)).toEqual([NotificationType.ORDER_CANCELLED]);
	});

	it('cancelling a whole order notifies each agent once, not once per line', async () => {
		const lines = [
			{ _id: OID(11), agentId: AGENT, itemStatus: OrderStatus.PENDING },
			{ _id: OID(12), agentId: AGENT, itemStatus: OrderStatus.PENDING },
			{ _id: OID(13), agentId: AGENT2, itemStatus: OrderStatus.PENDING },
		];
		const { svc, notificationService, orderItemModel } = build({
			order: { _id: ORDER_ID, customerId: CUSTOMER },
		});
		orderItemModel.find = jest.fn().mockReturnValue({ exec: () => Promise.resolve(lines) });

		await svc.cancelOrder(CUSTOMER as any, MemberType.CLIENT, ORDER_ID as any);

		const [drafts] = notificationService.record.mock.calls[0];
		expect(typesFor(drafts, AGENT)).toEqual([NotificationType.ORDER_CANCELLED_BY_CLIENT]);
		expect(typesFor(drafts, AGENT2)).toEqual([NotificationType.ORDER_CANCELLED_BY_CLIENT]);
		expect(typesFor(drafts, ADMIN)).toEqual([NotificationType.ORDER_CANCELLED]);
		expect(typesFor(drafts, CUSTOMER)).toEqual([]);
	});

	it('says nothing when cancelling a whole order changed no lines', async () => {
		const { svc, notificationService, orderItemModel } = build({
			order: { _id: ORDER_ID, customerId: CUSTOMER },
		});
		orderItemModel.find = jest.fn().mockReturnValue({ exec: () => Promise.resolve([]) });
		await svc.cancelOrder(CUSTOMER as any, MemberType.CLIENT, ORDER_ID as any);
		expect(notificationService.record).not.toHaveBeenCalled();
	});
});

describe('OrderService.cancelOrderItem', () => {
	it('lets the owning client cancel a PENDING item', async () => {
		const { svc, orderItemModel } = build({ item: makeItem({ itemStatus: OrderStatus.PENDING, customerId: CUSTOMER }) });
		await svc.cancelOrderItem(CUSTOMER as any, MemberType.CLIENT, ITEM_ID as any);
		expect(orderItemModel.findByIdAndUpdate).toHaveBeenCalledWith(
			expect.anything(),
			{ itemStatus: OrderStatus.CANCELLED },
			expect.anything(),
		);
	});

	it('forbids the client from cancelling once IN_TRANSIT', async () => {
		const { svc } = build({ item: makeItem({ itemStatus: OrderStatus.IN_TRANSIT, customerId: CUSTOMER }) });
		await expect(svc.cancelOrderItem(CUSTOMER as any, MemberType.CLIENT, ITEM_ID as any)).rejects.toThrow(
			Message.NOT_YOUR_ORDER,
		);
	});

	it('forbids an unrelated member', async () => {
		const { svc } = build({ item: makeItem({ itemStatus: OrderStatus.PENDING }) });
		await expect(svc.cancelOrderItem(OTHER as any, MemberType.CLIENT, ITEM_ID as any)).rejects.toThrow(
			Message.NOT_YOUR_ORDER,
		);
	});

	it('lets the owning agent cancel from IN_TRANSIT', async () => {
		const { svc, orderItemModel } = build({ item: makeItem({ itemStatus: OrderStatus.IN_TRANSIT, agentId: AGENT }) });
		await svc.cancelOrderItem(AGENT as any, MemberType.AGENT, ITEM_ID as any);
		expect(orderItemModel.findByIdAndUpdate).toHaveBeenCalled();
	});

	it('rejects cancelling a terminal INSTALLED item', async () => {
		const { svc } = build({ item: makeItem({ itemStatus: OrderStatus.INSTALLED }) });
		await expect(svc.cancelOrderItem('admin1' as any, MemberType.ADMIN, ITEM_ID as any)).rejects.toThrow(
			Message.INVALID_ORDER_TRANSITION,
		);
	});
});

describe('OrderService.cancelOrder — whole order', () => {
	it('owning client cancels all PENDING/CONFIRMED lines (not shipped ones)', async () => {
		const { svc, orderItemModel } = build({ order: { _id: ORDER_ID, customerId: CUSTOMER } });
		await svc.cancelOrder(CUSTOMER as any, MemberType.CLIENT, ORDER_ID as any);
		expect(orderItemModel.updateMany).toHaveBeenCalledWith(
			{ orderId: ORDER_ID, itemStatus: { $in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] } },
			{ itemStatus: OrderStatus.CANCELLED },
		);
	});

	it('admin can also cancel IN_TRANSIT lines', async () => {
		const { svc, orderItemModel } = build({ order: { _id: ORDER_ID, customerId: CUSTOMER } });
		await svc.cancelOrder('admin1' as any, MemberType.ADMIN, ORDER_ID as any);
		expect(orderItemModel.updateMany).toHaveBeenCalledWith(
			{ orderId: ORDER_ID, itemStatus: { $in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.IN_TRANSIT] } },
			{ itemStatus: OrderStatus.CANCELLED },
		);
	});

	it('forbids a non-owner client', async () => {
		const { svc } = build({ order: { _id: ORDER_ID, customerId: CUSTOMER } });
		await expect(svc.cancelOrder(OTHER as any, MemberType.CLIENT, ORDER_ID as any)).rejects.toThrow(
			Message.NOT_YOUR_ORDER,
		);
	});
});

describe('OrderService.getOrder — ownership', () => {
	it('forbids a stranger from reading an order', async () => {
		const { svc } = build({ order: { _id: ORDER_ID, customerId: CUSTOMER } });
		await expect(svc.getOrder(OTHER as any, MemberType.CLIENT, ORDER_ID as any)).rejects.toThrow(Message.NOT_YOUR_ORDER);
	});

	it('allows the owning customer to read it', async () => {
		const { svc } = build({ order: { _id: ORDER_ID, customerId: CUSTOMER } });
		const res: any = await svc.getOrder(CUSTOMER as any, MemberType.CLIENT, ORDER_ID as any);
		expect(res._id).toBe(ORDER_ID);
	});
});
