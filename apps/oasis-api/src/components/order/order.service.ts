import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { Order, Orders } from '../../libs/dto/order/order';
import { OrderItem, OrderItems } from '../../libs/dto/order/order-item';
import { AgentItemsInquiry, OrderInput, OrdersInquiry } from '../../libs/dto/order/order.input';
import { OrderItemStatusUpdate } from '../../libs/dto/order/order.update';
import { Plant } from '../../libs/dto/plant/plant';
import { Accessory } from '../../libs/dto/accessory/accessory';
import { OrderItemType, OrderStatus } from '../../libs/enums/order.enum';
import { PlantStatus } from '../../libs/enums/plant.enum';
import { AccessoryStatus } from '../../libs/enums/accessory.enum';
import { MemberType } from '../../libs/enums/member.enums';
import { Direction, Message } from '../../libs/Errors';
import { T } from '../../libs/types/common';
import { shapeIntoMongoObjectId } from '../../libs/config';

// Legal per-item status transitions. INSTALLED and CANCELLED are terminal.
const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	[OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
	[OrderStatus.CONFIRMED]: [OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED],
	[OrderStatus.IN_TRANSIT]: [OrderStatus.INSTALLED, OrderStatus.CANCELLED],
	[OrderStatus.INSTALLED]: [],
	[OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrderService {
	constructor(
		@InjectModel('Order') private readonly orderModel: Model<Order>,
		@InjectModel('OrderItem') private readonly orderItemModel: Model<OrderItem>,
		@InjectModel('OrderItemEvent') private readonly orderItemEventModel: Model<any>,
		@InjectModel('Plant') private readonly plantModel: Model<Plant>,
		@InjectModel('Accessory') private readonly accessoryModel: Model<Accessory>,
	) {}

	public async createOrder(customerId: ObjectId, input: OrderInput): Promise<Order> {
		if (!input.items?.length) throw new BadRequestException(Message.BAD_REQUEST);

		// resolve every line against real products; derive agent + price server-side
		const now = Date.now();
		const resolved: T[] = [];
		for (const line of input.items) {
			const refId = shapeIntoMongoObjectId(line.refId);
			let agentId: ObjectId;
			let unitPrice: number;
			let stockField: 'plantStock' | 'accessoryStock';
			let stockOnHand: number;

			if (line.itemType === OrderItemType.PLANT) {
				const plant = await this.plantModel.findOne({ _id: refId, plantStatus: PlantStatus.ACTIVE }).lean().exec();
				if (!plant) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
				agentId = (plant as any).memberId;
				unitPrice = (plant as any).plantPrice;
				stockField = 'plantStock';
				stockOnHand = (plant as any).plantStock ?? 0;
			} else {
				const acc = await this.accessoryModel
					.findOne({ _id: refId, accessoryStatus: AccessoryStatus.ACTIVE })
					.lean()
					.exec();
				if (!acc) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
				agentId = (acc as any).memberId;
				unitPrice = (acc as any).accessoryPrice;
				stockField = 'accessoryStock';
				stockOnHand = (acc as any).accessoryStock ?? 0;
			}

			let installationDate: Date | undefined = undefined;
			if (line.installationDate) {
				const d = new Date(line.installationDate);
				if (isNaN(d.getTime()) || d.getTime() <= now) {
					throw new BadRequestException(Message.INVALID_INSTALLATION_DATE);
				}
				installationDate = d;
			}

			const qty = line.itemQuantity && line.itemQuantity > 0 ? line.itemQuantity : 1;
			// availability is the agent's real stock, checked before anything is written
			if (stockOnHand < qty) throw new BadRequestException(Message.INSUFFICIENT_STOCK);

			resolved.push({
				itemType: line.itemType,
				refId,
				agentId,
				itemQuantity: qty,
				unitPrice,
				itemTotal: unitPrice * qty,
				installationDate,
				stockField,
			});
		}

		const orderTotal = resolved.reduce((sum, r) => sum + r.itemTotal, 0);

		let order: any;
		try {
			order = await this.orderModel.create({
				customerId: customerId,
				deliveryAddress: input.deliveryAddress,
				deliveryCity: input.deliveryCity,
				orderTotal: orderTotal,
			});

			const itemDocs = resolved.map(({ stockField, ...r }) => ({
				...r,
				orderId: order._id,
				customerId: customerId,
				deliveryAddress: input.deliveryAddress,
				deliveryCity: input.deliveryCity,
				itemStatus: OrderStatus.PENDING,
			}));
			const created = await this.orderItemModel.insertMany(itemDocs);

			// the units are now committed to this customer, so take them off the
			// agent's shelf; cancelling a line puts them back
			await Promise.all(
				resolved.map((r) =>
					r.stockField === 'plantStock'
						? this.plantModel.findByIdAndUpdate(r.refId, { $inc: { plantStock: -r.itemQuantity } }).exec()
						: this.accessoryModel.findByIdAndUpdate(r.refId, { $inc: { accessoryStock: -r.itemQuantity } }).exec(),
				),
			);

			// opening entry of each line's timeline — no actor, the system wrote it
			await this.recordEvents(
				created.map((doc: any) => ({ orderItemId: doc._id, orderId: order._id, status: OrderStatus.PENDING })),
			);
		} catch (err) {
			console.log('Error, Service.model:', err);
			// best-effort rollback of the header if items failed
			if (order?._id) await this.orderModel.findByIdAndDelete(order._id).exec();
			throw new BadRequestException(Message.CREATE_FAILED);
		}

		return this.fetchOneOrder(order._id);
	}

	public async getMyOrders(customerId: ObjectId, input: OrdersInquiry): Promise<Orders> {
		return this.listOrders({ customerId: customerId }, input);
	}

	public async getAllOrdersByAdmin(input: OrdersInquiry): Promise<Orders> {
		return this.listOrders({}, input);
	}

	public async getOrder(authMemberId: ObjectId, authMemberType: MemberType, orderId: ObjectId): Promise<Order> {
		const order = await this.orderModel.findById(orderId).exec();
		if (!order) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		// order detail is for the owning CLIENT or an ADMIN (agents use getAgentItems)
		if (authMemberType !== MemberType.ADMIN && order.customerId.toString() !== authMemberId.toString()) {
			throw new ForbiddenException(Message.NOT_YOUR_ORDER);
		}
		return this.fetchOneOrder(orderId);
	}

	public async getAgentItems(agentId: ObjectId, input: AgentItemsInquiry): Promise<OrderItems> {
		const match: T = { agentId: agentId };
		if (input.search?.itemStatus) match.itemStatus = input.search.itemStatus;
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		const result = await this.orderItemModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }, ...this.itemJoinStages()],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return result[0];
	}

	// AGENT (owner of the line) / ADMIN advances fulfilment: CONFIRMED → IN_TRANSIT → INSTALLED.
	public async updateOrderItemStatus(
		authMemberId: ObjectId,
		authMemberType: MemberType,
		input: OrderItemStatusUpdate,
	): Promise<OrderItem> {
		const itemId = shapeIntoMongoObjectId(input.itemId);
		const item = await this.orderItemModel.findById(itemId).exec();
		if (!item) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		const to = input.orderStatus;
		const advanceable = [OrderStatus.CONFIRMED, OrderStatus.IN_TRANSIT, OrderStatus.INSTALLED];
		if (!advanceable.includes(to) || !LEGAL_TRANSITIONS[item.itemStatus]?.includes(to)) {
			throw new BadRequestException(Message.INVALID_ORDER_TRANSITION);
		}

		if (authMemberType !== MemberType.ADMIN && item.agentId.toString() !== authMemberId.toString()) {
			throw new ForbiddenException(Message.NOT_YOUR_ORDER);
		}

		const patch: T = { itemStatus: to };
		if (input.trackingNumber !== undefined) patch.trackingNumber = input.trackingNumber;

		await this.orderItemModel.findByIdAndUpdate(itemId, patch, { new: true }).exec();
		await this.recordEvents([
			{ orderItemId: itemId, orderId: item.orderId, status: to, changedBy: authMemberId },
		]);
		return this.fetchOneItem(itemId);
	}

	// Cancel one line: owning CLIENT (PENDING/CONFIRMED), or owning AGENT / ADMIN (also IN_TRANSIT).
	public async cancelOrderItem(
		authMemberId: ObjectId,
		authMemberType: MemberType,
		itemId: ObjectId,
	): Promise<OrderItem> {
		const item = await this.orderItemModel.findById(itemId).exec();
		if (!item) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		const from = item.itemStatus;
		if (!LEGAL_TRANSITIONS[from]?.includes(OrderStatus.CANCELLED)) {
			throw new BadRequestException(Message.INVALID_ORDER_TRANSITION);
		}

		const me = authMemberId.toString();
		const isAdmin = authMemberType === MemberType.ADMIN;
		const isOwnerAgent = item.agentId.toString() === me;
		const customerMayCancel =
			item.customerId.toString() === me && (from === OrderStatus.PENDING || from === OrderStatus.CONFIRMED);

		if (!(isAdmin || isOwnerAgent || customerMayCancel)) {
			throw new ForbiddenException(Message.NOT_YOUR_ORDER);
		}

		await this.orderItemModel.findByIdAndUpdate(itemId, { itemStatus: OrderStatus.CANCELLED }, { new: true }).exec();
		await this.restoreStock(item);
		await this.recordEvents([
			{ orderItemId: itemId, orderId: item.orderId, status: OrderStatus.CANCELLED, changedBy: authMemberId },
		]);
		return this.fetchOneItem(itemId);
	}

	// Cancel a WHOLE order at once. The owning CLIENT cancels every still-cancellable
	// line it placed (PENDING/CONFIRMED); an ADMIN can also cancel IN_TRANSIT lines.
	// Already INSTALLED/CANCELLED lines are left untouched. (Agents cancel their own
	// lines individually via cancelOrderItem.)
	public async cancelOrder(authMemberId: ObjectId, authMemberType: MemberType, orderId: ObjectId): Promise<Order> {
		const order = await this.orderModel.findById(orderId).exec();
		if (!order) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		const isAdmin = authMemberType === MemberType.ADMIN;
		const isOwner = order.customerId.toString() === authMemberId.toString();
		if (!isAdmin && !isOwner) throw new ForbiddenException(Message.NOT_YOUR_ORDER);

		const cancellableFrom = isAdmin
			? [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.IN_TRANSIT]
			: [OrderStatus.PENDING, OrderStatus.CONFIRMED];

		// read the affected lines first: once they are CANCELLED we can no longer
		// tell which ones this call actually changed
		const affected = await this.orderItemModel
			.find({ orderId: order._id, itemStatus: { $in: cancellableFrom } })
			.exec();

		await this.orderItemModel
			.updateMany({ orderId: order._id, itemStatus: { $in: cancellableFrom } }, { itemStatus: OrderStatus.CANCELLED })
			.exec();

		for (const line of affected) await this.restoreStock(line);
		await this.recordEvents(
			affected.map((line: any) => ({
				orderItemId: line._id,
				orderId: order._id,
				status: OrderStatus.CANCELLED,
				changedBy: authMemberId,
			})),
		);

		return this.fetchOneOrder(order._id);
	}

	// ---- helpers ----

	/**
	 * Append-only fulfilment timeline. A failure here must never fail the
	 * transition the customer or agent just made, so it is logged, not thrown.
	 */
	private async recordEvents(events: T[]): Promise<void> {
		if (!events.length) return;
		try {
			await this.orderItemEventModel.insertMany(events);
		} catch (err) {
			console.log('Error, Service.model (order history):', err);
		}
	}

	/** Put a cancelled line's units back on the agent's shelf. */
	private async restoreStock(item: T): Promise<void> {
		const qty = item.itemQuantity ?? 0;
		if (qty <= 0) return;
		if (item.itemType === OrderItemType.PLANT) {
			await this.plantModel.findByIdAndUpdate(item.refId, { $inc: { plantStock: qty } }).exec();
		} else {
			await this.accessoryModel.findByIdAndUpdate(item.refId, { $inc: { accessoryStock: qty } }).exec();
		}
	}


	/**
	 * `baseMatch` carries the caller's ownership scope ({ customerId } for a
	 * CLIENT, {} for an ADMIN). Search only ever ADDS conditions on top of it,
	 * so a filter can never widen what the caller is allowed to see.
	 */
	private async applySearch(baseMatch: T, input: OrdersInquiry): Promise<T> {
		const search = input.search;
		if (!search) return baseMatch;
		const match: T = { ...baseMatch };

		if (search.deliveryCity) match.deliveryCity = search.deliveryCity;
		if (search.text) {
			const escaped = search.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			match.deliveryAddress = { $regex: escaped, $options: 'i' };
		}

		// status lives on the line items, so resolve the matching orders first —
		// scoped to the same owner, so a CLIENT still only reaches their own.
		if (search.itemStatus) {
			const itemMatch: T = { itemStatus: search.itemStatus };
			if (baseMatch.customerId) itemMatch.customerId = baseMatch.customerId;
			match._id = { $in: await this.orderItemModel.distinct('orderId', itemMatch).exec() };
		}
		return match;
	}

	private async listOrders(baseMatch: T, input: OrdersInquiry): Promise<Orders> {
		const match = await this.applySearch(baseMatch, input);
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };
		const result = await this.orderModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }, ...this.orderJoinStages()],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return result[0];
	}

	private async fetchOneOrder(orderId: ObjectId): Promise<Order> {
		const res = await this.orderModel.aggregate([{ $match: { _id: orderId } }, ...this.orderJoinStages()]).exec();
		if (!res.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return res[0];
	}

	private async fetchOneItem(itemId: ObjectId): Promise<OrderItem> {
		const res = await this.orderItemModel.aggregate([{ $match: { _id: itemId } }, ...this.itemJoinStages()]).exec();
		if (!res.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return res[0];
	}

	// attach items (each joined to its product + agent) and the customer to an order
	private orderJoinStages(): any[] {
		return [
			{
				$lookup: {
					from: 'orderitems',
					let: { oid: '$_id' },
					pipeline: [{ $match: { $expr: { $eq: ['$orderId', '$$oid'] } } }, ...this.itemJoinStages()],
					as: 'items',
				},
			},
			{ $lookup: { from: 'members', localField: 'customerId', foreignField: '_id', as: 'customerData' } },
			{ $unwind: { path: '$customerData', preserveNullAndEmptyArrays: true } },
		];
	}

	// join a line item to its product (plant OR accessory) and its agent
	private itemJoinStages(): any[] {
		return [
			{ $lookup: { from: 'plants', localField: 'refId', foreignField: '_id', as: 'plantData' } },
			{ $unwind: { path: '$plantData', preserveNullAndEmptyArrays: true } },
			{ $lookup: { from: 'accessories', localField: 'refId', foreignField: '_id', as: 'accessoryData' } },
			{ $unwind: { path: '$accessoryData', preserveNullAndEmptyArrays: true } },
			{ $lookup: { from: 'members', localField: 'agentId', foreignField: '_id', as: 'agentData' } },
			{ $unwind: { path: '$agentData', preserveNullAndEmptyArrays: true } },
			{
				$lookup: {
					from: 'orderitemevents',
					let: { iid: '$_id' },
					pipeline: [
						{ $match: { $expr: { $eq: ['$orderItemId', '$$iid'] } } },
						{ $sort: { createdAt: 1 } },
					],
					as: 'history',
				},
			},
		];
	}
}
