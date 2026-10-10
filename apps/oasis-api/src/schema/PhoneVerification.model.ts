import { Schema } from 'mongoose';

/**
 * One outstanding SMS code for one phone number.
 *
 * The code itself is never stored. `codeHash` is a bcrypt hash, the same
 * treatment memberPassword gets, so a dump of this collection does not let
 * anyone complete a verification. `attempts` and `expiresAt` are read on every
 * check so a code cannot be brute-forced or replayed, and `consumedAt` makes
 * it single-use.
 *
 * The TTL index drops rows an hour after they expire. That is cleanup, not
 * security — the expiry check in the service is what actually refuses a stale
 * code, because a TTL monitor only runs about once a minute.
 */
const PhoneVerificationSchema = new Schema(
	{
		// E.164, normalised before it ever reaches here
		phone: {
			type: String,
			required: true,
			index: true,
		},

		codeHash: {
			type: String,
			required: true,
			select: false,
		},

		expiresAt: {
			type: Date,
			required: true,
		},

		// wrong guesses so far; the service refuses the row past a ceiling
		attempts: {
			type: Number,
			default: 0,
		},

		// set the moment a correct code is accepted, so the same code cannot be
		// presented twice
		consumedAt: {
			type: Date,
		},

		// how many codes this number has been sent in the current window, used
		// for the per-number send limit
		sendCount: {
			type: Number,
			default: 1,
		},
	},
	{ timestamps: true, collection: 'phoneverifications' },
);

PhoneVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export default PhoneVerificationSchema;
