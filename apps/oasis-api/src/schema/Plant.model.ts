import { Schema } from 'mongoose';
import { PlantCategory, PlantLocation, PlantStatus, PlantType } from '../libs/enums/plant.enum';

const PlantSchema = new Schema(
	{
		plantType: {
			type: String,
			enum: PlantType,
			required: true,
		},

		plantCategory: {
			type: String,
			enum: PlantCategory,
			required: true,
		},

		plantStatus: {
			type: String,
			enum: PlantStatus,
			default: PlantStatus.ACTIVE,
		},

		// Where the plant is supplied FROM (nursery/agent origin) — NOT the delivery address.
		supplyLocation: {
			type: String,
			enum: PlantLocation,
			required: true,
		},

		plantAddress: {
			type: String,
			required: true,
		},

		plantName: {
			type: String,
			required: true,
		},

		plantPrice: {
			type: Number,
			required: true,
		},

		// height in centimeters
		plantHeight: {
			type: Number,
			required: true,
		},

		// pot diameter in centimeters (optional — e.g. balled trees have no pot)
		potSize: {
			type: Number,
		},

		// max approximate delivery/installation distance from supplyLocation, in km
		deliveryRadius: {
			type: Number,
			default: 0,
		},

		plantViews: {
			type: Number,
			default: 0,
		},

		plantLikes: {
			type: Number,
			default: 0,
		},

		plantComments: {
			type: Number,
			default: 0,
		},

		plantRank: {
			type: Number,
			default: 0,
		},

		plantImages: {
			type: [String],
			required: true,
		},

		plantDesc: {
			type: String,
		},

		// the AGENT (nursery/seller) who owns this listing
		memberId: {
			type: Schema.Types.ObjectId,
			required: true,
			ref: 'Member',
		},

		soldAt: {
			type: Date,
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'plants' },
);

// A given agent should not list the exact same plant twice at the same price.
PlantSchema.index({ memberId: 1, plantName: 1, plantType: 1, plantPrice: 1 }, { unique: true });
// Common discovery filters.
PlantSchema.index({ plantType: 1, plantCategory: 1, supplyLocation: 1, plantStatus: 1 });

export default PlantSchema;
