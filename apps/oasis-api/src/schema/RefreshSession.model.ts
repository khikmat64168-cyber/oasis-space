import { Schema } from 'mongoose';

/**
 * One refresh-token session — in practice, one browser on one device.
 *
 * Only a SHA-256 hash of the token is kept. SHA-256 rather than bcrypt on
 * purpose: the token is 256 bits of CSPRNG output, so there is nothing to
 * brute-force and no salt to defend against a dictionary; and the hash has to
 * be the lookup key, which a per-row bcrypt salt would make impossible.
 *
 * `familyId` ties every rotation of one login together. Rotation closes the
 * current row and opens the next one with the same familyId, so presenting a
 * token that was already rotated is detectable and the whole family — that one
 * login chain, not the member's other devices — can be revoked.
 */
const RefreshSessionSchema = new Schema(
	{
		/** sha256(token) in hex; the plaintext never reaches the database */
		tokenHash: {
			type: String,
			required: true,
			unique: true,
			index: true,
		},

		memberId: {
			type: Schema.Types.ObjectId,
			ref: 'Member',
			required: true,
			index: true,
		},

		/** every rotation of one login shares this */
		familyId: {
			type: String,
			required: true,
			index: true,
		},

		expiresAt: {
			type: Date,
			required: true,
		},

		/** set when the row is rotated away from, revoked, or logged out */
		revokedAt: {
			type: Date,
			default: null,
		},

		/** why it was closed — useful when reading an incident back */
		revokedReason: {
			type: String,
			enum: ['ROTATED', 'LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'ADMIN'],
			default: null,
		},

		/** the hash this row was rotated into, so a chain can be walked */
		rotatedTo: {
			type: String,
			default: null,
		},

		/** coarse device hint, for a future "your sessions" screen. Not a security control. */
		userAgent: {
			type: String,
			default: null,
		},
	},
	{ timestamps: true, collection: 'refreshsessions' },
);

/*
 * Mongo drops the document once expiresAt passes, so dead sessions do not
 * accumulate. This is a cleanup convenience only — expiry is still checked in
 * code, because the TTL monitor runs about once a minute and an expired row
 * must never be honoured in that window.
 */
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** revoke-all and family revocation both scan on these */
RefreshSessionSchema.index({ memberId: 1, revokedAt: 1 });
RefreshSessionSchema.index({ familyId: 1, revokedAt: 1 });

export default RefreshSessionSchema;
