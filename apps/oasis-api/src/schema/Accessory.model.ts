import { Schema } from 'mongoose';
import { AccessoryCategory, AccessoryStatus, AccessoryType } from '../libs/enums/accessory.enum';
import { PlantLocation } from '../libs/enums/plant.enum';

const AccessorySchema = new Schema(
	{
		accessoryType: {
			type: String,
			enum: AccessoryType,
			required: true,
		},

		accessoryCategory: {
			type: String,
			enum: AccessoryCategory,
			required: true,
		},

		accessoryStatus: {
			type: String,
			enum: AccessoryStatus,
			default: AccessoryStatus.ACTIVE,
		},

		accessoryName: {
			type: String,
			required: true,
		},

		accessoryPrice: {
			type: Number,
			required: true,
		},

		accessoryBrand: {
			type: String,
		},

		accessoryImages: {
			type: [String],
			required: true,
		},

		accessoryDesc: {
			type: String,
		},

		// where the accessory is supplied FROM (seller/agent origin) — not the delivery address
		supplyLocation: {
			type: String,
			enum: PlantLocation,
			required: true,
		},

		// max approximate delivery distance from supplyLocation, in km
		deliveryRadius: {
			type: Number,
			default: 0,
		},

		accessoryViews: {
			type: Number,
			default: 0,
		},

		accessoryLikes: {
			type: Number,
			default: 0,
		},

		accessoryComments: {
			type: Number,
			default: 0,
		},

		accessoryRank: {
			type: Number,
			default: 0,
		},

		// the AGENT (seller) who owns this listing
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
	{ timestamps: true, collection: 'accessories' },
);

AccessorySchema.index({ memberId: 1, accessoryName: 1, accessoryType: 1, accessoryPrice: 1 }, { unique: true });
AccessorySchema.index({ accessoryType: 1, accessoryCategory: 1, supplyLocation: 1, accessoryStatus: 1 });

export default AccessorySchema;
