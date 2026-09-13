import { OrderService } from './order.service';
import { OrderStatus, OrderItemType } from '../../libs/enums/order.enum';
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
		insertMany: jest.fn().mockResolvedValue([]),
		findById: jest.fn().mockReturnValue({ exec: () => Promise.resolve(item) }),
		findByIdAndUpdate: jest.fn().mockReturnValue({ exec: () => Promise.resolve(item) }),
		aggregate: jest.fn().mockReturnValue({ exec: () => Promise.resolve([item ?? { _id: ITEM_ID }]) }),
	};
	const plantModel: any = { findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(plant) }) }) };
	const accessoryModel: any = {
		findOne: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(accessory) }) }),
	};
	return {
		svc: new OrderService(orderModel, orderItemModel, plantModel, accessoryModel),
		orderModel,
		orderItemModel,
	};
}

describe('OrderService.createOrder — cart', () => {
	const future = new Date(Date.now() + 7 * 864e5).toISOString();

	it('derives agent, unitPrice, itemTotal + orderTotal from the product; items start PENDING', async () => {
		const { svc, orderModel, orderItemModel } = build({ plant: { _id: PLANT_ID, memberId: AGENT, plantPrice: 100 } });
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
		const { svc, orderItemModel } = build({ accessory: { _id: ACC_ID, memberId: AGENT2, accessoryPrice: 25 } });
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
		const { svc } = build({ plant: { _id: PLANT_ID, memberId: AGENT, plantPrice: 100 } });
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
