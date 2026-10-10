import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { RefreshService } from './refresh.service';

/**
 * An in-memory stand-in for the RefreshSession collection.
 *
 * findOneAndUpdate is the one operation whose semantics the rotation logic
 * actually depends on, so it is modelled faithfully: it matches on the filter
 * and applies the update in a single step, with no await in between. That is
 * what makes the concurrency test meaningful — if the service ever splits the
 * check and the write into two statements, the test below starts failing.
 */
class FakeSessionModel {
	public rows: any[] = [];

	private matches(row: any, filter: any): boolean {
		return Object.entries(filter).every(([key, value]: [string, any]) => {
			if (value && typeof value === 'object' && '$gt' in value) return row[key] > value.$gt;
			if (value === null) return row[key] === null || row[key] === undefined;
			return String(row[key]) === String(value);
		});
	}

	create(doc: any) {
		if (this.rows.some((row) => row.tokenHash === doc.tokenHash)) {
			return Promise.reject(new Error('E11000 duplicate key'));
		}
		const row = { _id: crypto.randomUUID(), revokedAt: null, rotatedTo: null, ...doc };
		this.rows.push(row);
		return Promise.resolve(row);
	}

	findOneAndUpdate(filter: any, update: any) {
		const row = this.rows.find((candidate) => this.matches(candidate, filter));
		const before = row ? { ...row } : null;
		if (row) Object.assign(row, update.$set);
		return { exec: () => Promise.resolve(before) };
	}

	findOne(filter: any) {
		const row = this.rows.find((candidate) => this.matches(candidate, filter)) ?? null;
		return { exec: () => Promise.resolve(row), select: () => ({ lean: () => ({ exec: () => Promise.resolve(row) }) }) };
	}

	updateMany(filter: any, update: any) {
		const hits = this.rows.filter((row) => this.matches(row, filter));
		hits.forEach((row) => Object.assign(row, update.$set));
		return { exec: () => Promise.resolve({ modifiedCount: hits.length }) };
	}

	updateOne(filter: any, update: any) {
		return this.updateMany(filter, update);
	}
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

describe('RefreshService', () => {
	let model: FakeSessionModel;
	let service: RefreshService;
	const memberId = '6ab8d144731d1aa86f65411f';

	beforeEach(() => {
		model = new FakeSessionModel();
		service = new RefreshService(model as any);
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => jest.restoreAllMocks());

	describe('issue', () => {
		it('stores only a hash, never the token itself', async () => {
			const { token } = await service.issue(memberId);

			expect(model.rows).toHaveLength(1);
			expect(model.rows[0].tokenHash).toBe(sha256(token));
			// the plaintext must appear nowhere in the stored document
			expect(JSON.stringify(model.rows[0])).not.toContain(token);
		});

		it('issues a token with at least 256 bits of entropy', async () => {
			const { token } = await service.issue(memberId);
			expect(Buffer.from(token, 'base64url')).toHaveLength(32);
		});

		it('gives each login its own family', async () => {
			const first = await service.issue(memberId);
			const second = await service.issue(memberId);
			expect(first.familyId).not.toBe(second.familyId);
		});
	});

	describe('rotate', () => {
		it('returns a new token and closes the old one', async () => {
			const { token } = await service.issue(memberId);
			const { next } = await service.rotate(token);

			expect(next.token).not.toBe(token);
			const old = model.rows.find((row) => row.tokenHash === sha256(token));
			expect(old.revokedAt).toBeInstanceOf(Date);
			expect(old.revokedReason).toBe('ROTATED');
			expect(old.rotatedTo).toBe(sha256(next.token));
		});

		it('keeps the new token in the same family', async () => {
			const issued = await service.issue(memberId);
			const { next } = await service.rotate(issued.token);
			expect(next.familyId).toBe(issued.familyId);
		});

		it('never lets the chain outlive the original login', async () => {
			const issued = await service.issue(memberId);
			const { next } = await service.rotate(issued.token);
			expect(next.expiresAt.getTime()).toBeLessThanOrEqual(issued.expiresAt.getTime());
		});

		it('rejects an unknown token', async () => {
			await expect(service.rotate('not-a-real-token')).rejects.toBeInstanceOf(UnauthorizedException);
		});

		it('rejects an expired token', async () => {
			const { token } = await service.issue(memberId);
			model.rows[0].expiresAt = new Date(Date.now() - 1000);
			await expect(service.rotate(token)).rejects.toBeInstanceOf(UnauthorizedException);
		});

		it('rejects a token from a revoked session', async () => {
			const { token } = await service.issue(memberId);
			await service.revokeByToken(token);
			await expect(service.rotate(token)).rejects.toBeInstanceOf(UnauthorizedException);
		});
	});

	describe('reuse detection', () => {
		it('revokes the whole family when a rotated token is presented again', async () => {
			const issued = await service.issue(memberId);
			const { next } = await service.rotate(issued.token);

			await expect(service.rotate(issued.token)).rejects.toBeInstanceOf(UnauthorizedException);

			const live = model.rows.filter((row) => row.familyId === issued.familyId && row.revokedAt === null);
			expect(live).toHaveLength(0);
			const successor = model.rows.find((row) => row.tokenHash === sha256(next.token));
			expect(successor.revokedReason).toBe('REUSE_DETECTED');
		});

		it('leaves the member’s other devices alone', async () => {
			const phone = await service.issue(memberId);
			const laptop = await service.issue(memberId);

			await service.rotate(phone.token);
			await expect(service.rotate(phone.token)).rejects.toBeInstanceOf(UnauthorizedException);

			const laptopRow = model.rows.find((row) => row.familyId === laptop.familyId);
			expect(laptopRow.revokedAt).toBeNull();
		});

		it('only one of two concurrent rotations of the same token succeeds', async () => {
			const { token } = await service.issue(memberId);

			const results = await Promise.allSettled([service.rotate(token), service.rotate(token)]);
			const ok = results.filter((result) => result.status === 'fulfilled');
			const failed = results.filter((result) => result.status === 'rejected');

			expect(ok).toHaveLength(1);
			expect(failed).toHaveLength(1);
		});
	});

	describe('revocation', () => {
		it('revokeByToken is idempotent and safe for an unknown token', async () => {
			const { token } = await service.issue(memberId);
			await service.revokeByToken(token);
			await expect(service.revokeByToken(token)).resolves.toBeUndefined();
			await expect(service.revokeByToken('never-issued')).resolves.toBeUndefined();
		});

		it('revokeAllForMember closes every live session', async () => {
			await service.issue(memberId);
			await service.issue(memberId);
			await service.issue('6aa28ec6bbed97523a19e3fb');

			const closed = await service.revokeAllForMember(memberId);

			expect(closed).toBe(2);
			expect(model.rows.filter((row) => row.revokedAt === null)).toHaveLength(1);
		});

		it('a token revoked by logout cannot refresh afterwards', async () => {
			const { token } = await service.issue(memberId);
			await service.revokeAllForMember(memberId);
			await expect(service.rotate(token)).rejects.toBeInstanceOf(UnauthorizedException);
		});
	});

	describe('memberIdForToken', () => {
		it('resolves the owner without consuming the token', async () => {
			const { token } = await service.issue(memberId);
			const owner = await service.memberIdForToken(token);

			expect(String(owner)).toBe(memberId);
			expect(model.rows[0].revokedAt).toBeNull();
		});

		it('returns null for a token that was never issued', async () => {
			await expect(service.memberIdForToken('nope')).resolves.toBeNull();
		});
	});
});
