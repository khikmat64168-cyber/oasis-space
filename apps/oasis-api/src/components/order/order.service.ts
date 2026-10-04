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
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../libs/enums/notification.enum';
import { shapeIntoMongoObjectId } from '../../libs/config';

// Legal per-item status transitions. INSTALLED and CANCELLED are terminal.
const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	[OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
	[OrderStatus.CONFIRMED]: [OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED],
	[OrderStatus.IN_TRANSIT]: [OrderStatus.INSTALLED, OrderStatus.CANCELLED],
	[OrderStatus.INSTALLED]: [],
	[OrderStatus.CANCELLED]: [],
};

/**
 * What the client and the admin are told for each forward transition. Keeping
 * the wording in one table is what stops the three call sites from drifting
 * into three different vocabularies for the same lifecycle.
 */
const ADVANCE_COPY: Partial<Record<OrderStatus, { type: NotificationType; title: string; desc: string }>> = {
	[OrderStatus.CONFIRMED]: {
		type: NotificationType.ORDER_CONFIRMED,
		title: 'Order confirmed',
		desc: 'The agent accepted this order and is preparing it.',
	},
	[OrderStatus.IN_TRANSIT]: {
		type: NotificationType.ORDER_IN_TRANSIT,
		title: 'Order on its way',
		desc: 'This order has left the nursery and is in transit.',
	},
	[OrderStatus.INSTALLED]: {
		type: NotificationType.ORDER_INSTALLED,
		title: 'Order installed',
		desc: 'This order has been delivered and installed.',
	},
};

@Injectable()
export class OrderService {
	constructor(
		@InjectModel('Order') private readonly orderModel: Model<Order>,
		@InjectModel('OrderItem') private readonly orderItemModel: Model<OrderItem>,
		@InjectModel('OrderItemEvent') private readonly orderItemEventModel: Model<any>,
		@InjectModel('Plant') private readonly plantModel: Model<Plant>,
		@InjectModel('Accessory') private readonly accessoryModel: Model<Accessory>,
		private readonly notificationService: NotificationService,
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
			let itemName: string;

			if (line.itemType === OrderItemType.PLANT) {
				const plant = await this.plantModel.findOne({ _id: refId, plantStatus: PlantStatus.ACTIVE }).lean().exec();
				if (!plant) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
				agentId = (plant as any).memberId;
				unitPrice = (plant as any).plantPrice;
				stockField = 'plantStock';
				stockOnHand = (plant as any).plantStock ?? 0;
				itemName = (plant as any).plantName;
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
				itemName = (acc as any).accessoryName;
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
				itemName,
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

			const itemDocs = resolved.map(({ stockField, itemName, ...r }) => ({
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
						? this.plantModel
								// plantOrders counts orders, not units — one line, one order
								.findByIdAndUpdate(r.refId, { $inc: { plantStock: -r.itemQuantity, plantOrders: 1 } })
								.exec()
						: this.accessoryModel.findByIdAndUpdate(r.refId, { $inc: { accessoryStock: -r.itemQuantity } }).exec(),
				),
			);

			// opening entry of each line's timeline — no actor, the system wrote it
			await this.recordEvents(
				created.map((doc: any) => ({ orderItemId: doc._id, orderId: order._id, status: OrderStatus.PENDING })),
			);

			// One order can span several agents, so group by agent: each supplier
			// hears once about the lines that are theirs, not once per line.
			const byAgent = new Map<string, { agentId: ObjectId; names: string[] }>();
			for (const r of resolved) {
				const key = String(r.agentId);
				if (!byAgent.has(key)) byAgent.set(key, { agentId: r.agentId, names: [] });
				byAgent.get(key)!.names.push(`${r.itemName} x${r.itemQuantity}`);
			}

			const adminIds = await this.notificationService.activeAdminIds();
			const summary = `${resolved.length} item${resolved.length === 1 ? '' : 's'} · ₩${orderTotal.toLocaleString(
				'en-US',
			)}`;

			await this.notificationService.record([
				// The customer's own receipt carries NO senderId: they are both the
				// actor and the receiver here, and record() drops a draft whose
				// sender is its receiver to stop members notifying themselves.
				{
					receiverId: customerId,
					notificationType: NotificationType.ORDER_CREATED,
					notificationTitle: 'Order placed',
					notificationDesc: summary,
					orderId: order._id,
				},
				...Array.from(byAgent.values()).map((g) => ({
					receiverId: g.agentId,
					senderId: customerId,
					notificationType: NotificationType.NEW_ORDER,
					notificationTitle: 'New order received',
					notificationDesc: g.names.join(', '),
					orderId: order._id,
				})),
				...adminIds.map((id) => ({
					receiverId: id,
					senderId: customerId,
					notificationType: NotificationType.NEW_ORDER,
					notificationTitle: 'New order placed',
					notificationDesc: summary,
					orderId: order._id,
				})),
			]);
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

		const copy = ADVANCE_COPY[to]!;
		const adminIds = await this.notificationService.activeAdminIds();
		const ref = { orderId: item.orderId, orderItemId: itemId };

		await this.notificationService.record([
			// the customer asked for this order; they are the one who wants to know
			{
				receiverId: item.customerId,
				senderId: authMemberId,
				notificationType: copy.type,
				notificationTitle: copy.title,
				notificationDesc: copy.desc,
				...ref,
			},
			...adminIds.map((id) => ({
				receiverId: id,
				senderId: authMemberId,
				notificationType: copy.type,
				notificationTitle: copy.title,
				notificationDesc: copy.desc,
				...ref,
			})),
			// The agent hears about their own line only when somebody ELSE moved
			// it. Agents advance their own lines constantly; telling them about
			// the button they just pressed would be noise, not news.
			...(authMemberType === MemberType.ADMIN
				? [
						{
							receiverId: item.agentId,
							senderId: authMemberId,
							notificationType: NotificationType.ORDER_DELIVERY_UPDATE,
							notificationTitle: 'Delivery status updated',
							notificationDesc: `An admin moved one of your lines to ${to.toLowerCase().replace(/_/g, ' ')}.`,
							...ref,
						},
				  ]
				: []),
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

		/**
		 * An agent turning down a line that never left PENDING is a rejection,
		 * not a cancellation: the order had not been accepted yet, so nothing
		 * was undone. There is no REJECTED status to read this off, so it is
		 * derived from who cancelled and from where.
		 */
		const rejected = !isAdmin && isOwnerAgent && from === OrderStatus.PENDING;
		const byCustomer = item.customerId.toString() === me;
		const adminIds = await this.notificationService.activeAdminIds();
		const ref = { orderId: item.orderId, orderItemId: itemId };
		const base = { senderId: authMemberId, ...ref };

		const drafts: T[] = [];
		if (byCustomer) {
			// the supplying agent is the one who has to stop preparing it
			drafts.push({
				...base,
				receiverId: item.agentId,
				notificationType: NotificationType.ORDER_CANCELLED_BY_CLIENT,
				notificationTitle: 'Order cancelled by client',
				notificationDesc: 'The customer cancelled one line of this order.',
			});
		} else if (rejected) {
			drafts.push({
				...base,
				receiverId: item.customerId,
				notificationType: NotificationType.ORDER_REJECTED,
				notificationTitle: 'Order declined',
				notificationDesc: 'The agent could not take this order on.',
			});
		} else {
			drafts.push({
				...base,
				receiverId: item.customerId,
				notificationType: NotificationType.ORDER_CANCELLED,
				notificationTitle: 'Order cancelled',
				notificationDesc: 'One line of this order was cancelled.',
			});
			// an admin cancelling is news to BOTH sides, not just the customer
			if (isAdmin) {
				drafts.push({
					...base,
					receiverId: item.agentId,
					notificationType: NotificationType.ORDER_CANCELLED,
					notificationTitle: 'Order cancelled',
					notificationDesc: 'An admin cancelled one of your lines.',
				});
			}
		}

		drafts.push(
			...adminIds.map((id) => ({
				...base,
				receiverId: id,
				notificationType: rejected ? NotificationType.ORDER_REJECTED : NotificationType.ORDER_CANCELLED,
				notificationTitle: rejected ? 'Order declined by agent' : 'Order cancelled',
				notificationDesc: 'One line of this order is no longer going ahead.',
			})),
		);
		await this.notificationService.record(drafts as any);
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

		/**
		 * One notification per recipient for the WHOLE order, never one per
		 * line: cancelling a five-line order is one thing that happened, and
		 * five identical rows in the bell would read as a bug. Nothing is sent
		 * at all when the call changed nothing.
		 */
		if (affected.length) {
			const byAgent = new Map<string, ObjectId>();
			for (const line of affected) byAgent.set(String(line.agentId), line.agentId);

			const adminIds = await this.notificationService.activeAdminIds();
			const n = affected.length;
			const desc = `${n} line${n === 1 ? '' : 's'} of this order ${n === 1 ? 'was' : 'were'} cancelled.`;
			const base = { senderId: authMemberId, orderId: order._id };

			await this.notificationService.record([
				...Array.from(byAgent.values()).map((agentId) => ({
					...base,
					receiverId: agentId,
					notificationType: isAdmin
						? NotificationType.ORDER_CANCELLED
						: NotificationType.ORDER_CANCELLED_BY_CLIENT,
					notificationTitle: isAdmin ? 'Order cancelled' : 'Order cancelled by client',
					notificationDesc: desc,
				})),
				// the customer is told only when it was not their own doing
				...(isAdmin
					? [
							{
								...base,
								receiverId: order.customerId,
								notificationType: NotificationType.ORDER_CANCELLED,
								notificationTitle: 'Order cancelled',
								notificationDesc: desc,
							},
					  ]
					: []),
				...adminIds.map((id) => ({
					...base,
					receiverId: id,
					notificationType: NotificationType.ORDER_CANCELLED,
					notificationTitle: 'Order cancelled',
					notificationDesc: desc,
				})),
			]);
		}

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
			// a cancelled line never really happened: return the units and the count
			await this.plantModel
				.findByIdAndUpdate(item.refId, { $inc: { plantStock: qty, plantOrders: -1 } })
				.exec();
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
