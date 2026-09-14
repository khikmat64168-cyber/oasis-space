import { Schema } from 'mongoose';
import { OrderStatus, OrderItemType } from '../libs/enums/order.enum';
import { PlantLocation } from '../libs/enums/plant.enum';

// One purchased product line within an Order. customerId / agentId / delivery info
// are denormalized from the parent order + product so an agent's fulfilment queue
// and ownership checks are self-contained (no extra joins needed).
const OrderItemSchema = new Schema(
	{
		orderId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Order',
		},

		itemType: {
			type: String,
			enum: OrderItemType,
			required: true,
		},

		// id of the Plant or Accessory this line points at
		refId: {
			type: Schema.Types.ObjectId,
			required: true,
		},

		customerId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		// the AGENT who owns the product on this line (derived from the product)
		agentId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		itemQuantity: {
			type: Number,
			default: 1,
		},

		// snapshot of the product price at order time
		unitPrice: {
			type: Number,
			required: true,
		},

		itemTotal: {
			type: Number,
			required: true,
		},

		// delivery info denormalized from the order (agent needs it to fulfil)
		deliveryAddress: {
			type: String,
			required: true,
		},

		deliveryCity: {
			type: String,
			enum: PlantLocation,
		},

		installationDate: {
			type: Date,
		},

		// per-item fulfilment status (each agent advances their own lines)
		itemStatus: {
			type: String,
			enum: OrderStatus,
			default: OrderStatus.PENDING,
		},
	},
	{ timestamps: true, collection: 'orderitems' },
);

OrderItemSchema.index({ orderId: 1 });
OrderItemSchema.index({ agentId: 1, itemStatus: 1 });
OrderItemSchema.index({ customerId: 1 });

export default OrderItemSchema;
