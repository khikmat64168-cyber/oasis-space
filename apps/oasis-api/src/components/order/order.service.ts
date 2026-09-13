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

			if (line.itemType === OrderItemType.PLANT) {
				const plant = await this.plantModel.findOne({ _id: refId, plantStatus: PlantStatus.ACTIVE }).lean().exec();
				if (!plant) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
				agentId = (plant as any).memberId;
				unitPrice = (plant as any).plantPrice;
			} else {
				const acc = await this.accessoryModel
					.findOne({ _id: refId, accessoryStatus: AccessoryStatus.ACTIVE })
					.lean()
					.exec();
				if (!acc) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
				agentId = (acc as any).memberId;
				unitPrice = (acc as any).accessoryPrice;
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
			resolved.push({
				itemType: line.itemType,
				refId,
				agentId,
				itemQuantity: qty,
				unitPrice,
				itemTotal: unitPrice * qty,
				installationDate,
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

			const itemDocs = resolved.map((r) => ({
				...r,
				orderId: order._id,
				customerId: customerId,
				deliveryAddress: input.deliveryAddress,
				deliveryCity: input.deliveryCity,
				itemStatus: OrderStatus.PENDING,
			}));
			await this.orderItemModel.insertMany(itemDocs);
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

		await this.orderItemModel.findByIdAndUpdate(itemId, { itemStatus: to }, { new: true }).exec();
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
		return this.fetchOneItem(itemId);
	}

	// ---- helpers ----

	private async listOrders(match: T, input: OrdersInquiry): Promise<Orders> {
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
		];
	}
}
