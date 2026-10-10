import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import * as crypto from 'crypto';
import { REFRESH_TOKEN_TTL_DAYS } from '../../libs/authConfig';

/** The one error every failure path returns, so nothing is leaked by wording. */
export const REFRESH_REJECTED = 'REFRESH_REJECTED';

export interface IssuedRefresh {
	/** plaintext — goes straight into the cookie and is never stored or logged */
	token: string;
	expiresAt: Date;
	familyId: string;
}

@Injectable()
export class RefreshService {
	constructor(@InjectModel('RefreshSession') private readonly sessionModel: Model<any>) {}

	/** 256 bits of CSPRNG output; base64url so it is cookie-safe as-is. */
	private newToken(): string {
		return crypto.randomBytes(32).toString('base64url');
	}

	private hash(token: string): string {
		return crypto.createHash('sha256').update(token).digest('hex');
	}

	private expiry(): Date {
		return new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
	}

	/** Opens a new family. Called on login and signup. */
	public async issue(memberId: ObjectId | string, userAgent?: string): Promise<IssuedRefresh> {
		const token = this.newToken();
		const familyId = crypto.randomUUID();
		const expiresAt = this.expiry();

		await this.sessionModel.create({
			tokenHash: this.hash(token),
			memberId,
			familyId,
			expiresAt,
			userAgent: userAgent?.slice(0, 200) ?? null,
		});

		return { token, expiresAt, familyId };
	}

	/**
	 * Exchange a refresh token for the next one in its family.
	 *
	 * The close-the-old-row step is a single findOneAndUpdate filtered on
	 * `revokedAt: null`, which is atomic in MongoDB: of two requests arriving
	 * with the same token, exactly one matches an open row and wins. The loser
	 * matches nothing and takes the reuse path. That is what makes concurrent
	 * refreshes safe without needing a transaction, and it is also why the
	 * check and the write cannot be split into two statements.
	 */
	public async rotate(
		presentedToken: string,
		userAgent?: string,
	): Promise<{ memberId: ObjectId; next: IssuedRefresh }> {
		const presentedHash = this.hash(presentedToken);
		const now = new Date();

		const claimed = await this.sessionModel
			.findOneAndUpdate(
				{ tokenHash: presentedHash, revokedAt: null, expiresAt: { $gt: now } },
				{ $set: { revokedAt: now, revokedReason: 'ROTATED' } },
				{ new: false },
			)
			.exec();

		if (!claimed) {
			// Either the token never existed, or it has expired, or it was
			// already rotated/revoked. Only the last case is an attack signal,
			// and only that case has a family to punish.
			await this.handleRejected(presentedHash);
			throw new UnauthorizedException(REFRESH_REJECTED);
		}

		const token = this.newToken();
		const tokenHash = this.hash(token);
		const expiresAt = this.expiry();

		await this.sessionModel.create({
			tokenHash,
			memberId: claimed.memberId,
			familyId: claimed.familyId,
			// the chain never outlives the original login
			expiresAt: claimed.expiresAt < expiresAt ? claimed.expiresAt : expiresAt,
			userAgent: userAgent?.slice(0, 200) ?? claimed.userAgent ?? null,
		});

		await this.sessionModel.updateOne({ _id: claimed._id }, { $set: { rotatedTo: tokenHash } }).exec();

		return {
			memberId: claimed.memberId,
			next: { token, expiresAt: claimed.expiresAt < expiresAt ? claimed.expiresAt : expiresAt, familyId: claimed.familyId },
		};
	}

	/**
	 * A token that is known but already closed means the plaintext existed in
	 * two places — the legitimate client and someone else. Which of the two is
	 * presenting it now cannot be told apart, so the whole family is closed and
	 * both are forced to sign in again.
	 *
	 * Only that one family: the member's other devices have their own families
	 * and are left alone, because a stolen token says nothing about them.
	 */
	private async handleRejected(presentedHash: string): Promise<void> {
		const known = await this.sessionModel.findOne({ tokenHash: presentedHash }).exec();
		if (!known) return; // never issued, or long gone — nothing to revoke

		await this.sessionModel
			.updateMany(
				{ familyId: known.familyId, revokedAt: null },
				{ $set: { revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' } },
			)
			.exec();

		// the hash is not the token, so this is safe to record
		console.warn('[auth] refresh-token reuse detected; family revoked', {
			familyId: known.familyId,
			memberId: String(known.memberId),
		});
	}

	/** Log out this one device. Idempotent: an unknown token is a no-op. */
	public async revokeByToken(presentedToken: string): Promise<void> {
		await this.sessionModel
			.updateMany(
				{ tokenHash: this.hash(presentedToken), revokedAt: null },
				{ $set: { revokedAt: new Date(), revokedReason: 'LOGOUT' } },
			)
			.exec();
	}

	/**
	 * Who a token belongs to, without consuming it. Used by logout-all, which
	 * needs the owner but must not rotate anything.
	 */
	public async memberIdForToken(presentedToken: string): Promise<ObjectId | null> {
		const found = await this.sessionModel
			.findOne({ tokenHash: this.hash(presentedToken) })
			.select('memberId')
			.lean<{ memberId: ObjectId }>()
			.exec();
		return found?.memberId ?? null;
	}

	/** Every device. For password changes, suspension, or "sign out everywhere". */
	public async revokeAllForMember(memberId: ObjectId | string, reason = 'LOGOUT_ALL'): Promise<number> {
		const result = await this.sessionModel
			.updateMany({ memberId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } })
			.exec();
		return result.modifiedCount ?? 0;
	}
}
