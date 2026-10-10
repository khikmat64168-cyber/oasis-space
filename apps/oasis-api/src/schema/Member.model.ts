import { Schema } from 'mongoose';
import { MemberAuthType, MemberStatus, MemberType } from '../libs/enums/member.enums';

const MemberSchema = new Schema(
	{
		memberType: {
			type: String,
			enum: MemberType,
			default: MemberType.CLIENT,
		},

		memberStatus: {
			type: String,
			enum: MemberStatus,
			default: MemberStatus.ACTIVE,
		},

		memberAuthType: {
			type: String,
			enum: MemberAuthType,
			default: MemberAuthType.PHONE,
		},

		memberPhone: {
			type: String,
			index: { unique: true, sparse: true },
			required: true,
		},

		// Set by the server only, when a signup presented a valid verification
		// ticket. Never written from client input — see MemberInput, which does
		// not expose it, and member.service.signup, which sets it explicitly.
		// Accounts created before phone verification existed keep `false`; they
		// are not locked out, because login has never consulted this field.
		memberPhoneVerified: {
			type: Boolean,
			default: false,
		},

		// Optional. There is no email-based login — `login` matches on
		// memberNick — so this is a contact address, not an identifier. Sparse
		// unique so the many accounts without one do not collide on null.
		memberEmail: {
			type: String,
			index: { unique: true, sparse: true },
		},

		memberEmailVerified: {
			type: Boolean,
			default: false,
		},

		memberNick: {
			type: String,
			index: { unique: true, sparse: true },
			required: true,
		},

		memberPassword: {
			type: String,
			select: false,
			required: true,
		},

		memberFullName: {
			type: String,
		},

		memberAddress: {
			type: String,
		},

		memberDesc: {
			type: String,
		},

		memberPlants: {
			type: Number,
			default: 0,
		},

		memberAccessories: {
			type: Number,
			default: 0,
		},

		memberArticles: {
			type: Number,
			default: 0,
		},

		memberFollowers: {
			type: Number,
			default: 0,
		},

		memberFollowings: {
			type: Number,
			default: 0,
		},

		memberPoints: {
			type: Number,
			default: 0,
		},

		memberLikes: {
			type: Number,
			default: 0,
		},

		memberViews: {
			type: Number,
			default: 0,
		},

		memberComments: {
			type: Number,
			default: 0,
		},

		memberRank: {
			type: Number,
			default: 0,
		},

		memberWarnings: {
			type: Number,
			default: 0,
		},

		memberBlocks: {
			type: Number,
			default: 0,
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'members' },
);

export default MemberSchema;
