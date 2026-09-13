import { Schema } from 'mongoose';
import { PlantLocation } from '../libs/enums/plant.enum';

// Order = the checkout header. The actual purchased products live in OrderItem,
// so one order can contain several items from several agents. Per-item fulfilment
// status lives on OrderItem (each agent fulfils their own lines independently).
const OrderSchema = new Schema(
	{
		// the CLIENT who placed the order
		customerId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		// WHERE THE CUSTOMER WANTS IT DELIVERED — distinct from a product's supplyLocation
		deliveryAddress: {
			type: String,
			required: true,
		},

		deliveryCity: {
			type: String,
			enum: PlantLocation,
		},

		// server-computed sum of all item totals
		orderTotal: {
			type: Number,
			required: true,
		},
	},
	{ timestamps: true, collection: 'orders' },
);

OrderSchema.index({ customerId: 1, createdAt: -1 });

export default OrderSchema;
