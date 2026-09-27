import { Schema } from 'mongoose';
import { OrderStatus } from '../libs/enums/order.enum';

// One entry in a line item's fulfilment history. Written on creation (PENDING)
// and on every accepted status change, so the timeline is an append-only record
// of what happened rather than a guess reconstructed from the current status.
const OrderItemEventSchema = new Schema(
	{
		orderItemId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'OrderItem',
		},

		// denormalized so an order's whole timeline can be read in one query
		orderId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Order',
		},

		status: {
			type: String,
			enum: OrderStatus,
			required: true,
		},

		// who caused the transition; absent for the system-written PENDING entry
		changedBy: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
		},
	},
	{ timestamps: true, collection: 'orderitemevents' },
);

OrderItemEventSchema.index({ orderItemId: 1, createdAt: 1 });
OrderItemEventSchema.index({ orderId: 1, createdAt: 1 });

export default OrderItemEventSchema;
