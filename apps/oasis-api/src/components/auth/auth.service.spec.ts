import { JwtService } from '@nestjs/jwt';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService, ACCESS_TOKEN_EXPIRED, ACCESS_TOKEN_INVALID } from './auth.service';
import { MemberStatus, MemberType } from '../../libs/enums/member.enums';

const SECRET = 'test-secret-for-unit-tests';
const MEMBER_ID = '6ab8d144731d1aa86f65411f';

/** Stands in for the Member collection; records how often it was read. */
class FakeMemberModel {
	public reads = 0;
	constructor(private doc: { memberType: string; memberStatus: string } | null) {}

	setDoc(doc: { memberType: string; memberStatus: string } | null) {
		this.doc = doc;
	}

	findById(_id: string) {
		this.reads += 1;
		return { select: () => ({ lean: () => ({ exec: () => Promise.resolve(this.doc) }) }) };
	}
}

describe('AuthService', () => {
	let jwtService: JwtService;
	let members: FakeMemberModel;
	let service: AuthService;

	const sign = (payload: any, expiresIn: string) => jwtService.sign(payload, { expiresIn });

	beforeEach(() => {
		jwtService = new JwtService({ secret: SECRET });
		members = new FakeMemberModel({ memberType: MemberType.AGENT, memberStatus: MemberStatus.ACTIVE });
		service = new AuthService(jwtService, members as any);
	});

	describe('token payload', () => {
		it('never carries the password hash', async () => {
			const token = await service.createToken({
				_id: MEMBER_ID,
				memberNick: 'grower',
				memberPassword: '$2a$10$hashed',
			} as any);

			const claims = jwtService.decode(token) as any;
			expect(claims.memberPassword).toBeUndefined();
			expect(token).not.toContain('hashed');
		});
	});

	describe('verifyToken', () => {
		it('reports an expired token distinctly from an invalid one', async () => {
			const expired = sign({ _id: MEMBER_ID }, '-10s');

			await expect(service.verifyToken(expired)).rejects.toMatchObject({ message: ACCESS_TOKEN_EXPIRED });
		});

		it('reports a tampered token as invalid, not expired', async () => {
			const forged = sign({ _id: MEMBER_ID }, '60s') + 'x';

			await expect(service.verifyToken(forged)).rejects.toMatchObject({ message: ACCESS_TOKEN_INVALID });
		});

		it('rejects a token signed with another secret', async () => {
			const other = new JwtService({ secret: 'a-different-secret' });
			const foreign = other.sign({ _id: MEMBER_ID }, { expiresIn: '60s' });

			await expect(service.verifyToken(foreign)).rejects.toMatchObject({ message: ACCESS_TOKEN_INVALID });
		});
	});

	describe('verifyActiveToken', () => {
		it('accepts a live member and returns the stored role', async () => {
			// the token claims CLIENT; the record says AGENT, and the record wins
			const token = sign({ _id: MEMBER_ID, memberType: MemberType.CLIENT }, '60s');

			const member = await service.verifyActiveToken(token);

			expect(member.memberType).toBe(MemberType.AGENT);
		});

		it('refuses a member blocked after the token was issued', async () => {
			const token = sign({ _id: MEMBER_ID, memberStatus: MemberStatus.ACTIVE }, '60s');
			members.setDoc({ memberType: MemberType.CLIENT, memberStatus: MemberStatus.BLOCK });

			await expect(service.verifyActiveToken(token)).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('refuses a member deleted after the token was issued', async () => {
			const token = sign({ _id: MEMBER_ID }, '60s');
			members.setDoc({ memberType: MemberType.CLIENT, memberStatus: MemberStatus.DELETE });

			await expect(service.verifyActiveToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
		});

		it('refuses a token whose member no longer exists', async () => {
			const token = sign({ _id: MEMBER_ID }, '60s');
			members.setDoc(null);

			await expect(service.verifyActiveToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
		});

		it('does not read the database once per request', async () => {
			const token = sign({ _id: MEMBER_ID }, '60s');

			await service.verifyActiveToken(token);
			await service.verifyActiveToken(token);
			await service.verifyActiveToken(token);

			expect(members.reads).toBe(1);
		});

		it('picks up a change once the cached record is dropped', async () => {
			const token = sign({ _id: MEMBER_ID }, '60s');
			await service.verifyActiveToken(token);

			members.setDoc({ memberType: MemberType.CLIENT, memberStatus: MemberStatus.BLOCK });
			service.invalidateLiveMember(MEMBER_ID);

			await expect(service.verifyActiveToken(token)).rejects.toBeInstanceOf(ForbiddenException);
		});

		it('still rejects an expired token before looking anything up', async () => {
			const expired = sign({ _id: MEMBER_ID }, '-10s');

			await expect(service.verifyActiveToken(expired)).rejects.toMatchObject({ message: ACCESS_TOKEN_EXPIRED });
			expect(members.reads).toBe(0);
		});
	});

	describe('passwords', () => {
		it('hashes and verifies', async () => {
			const hash = await service.hashPassword('correct horse battery staple');

			expect(hash).not.toBe('correct horse battery staple');
			await expect(service.comparePassword('correct horse battery staple', hash)).resolves.toBe(true);
			await expect(service.comparePassword('wrong', hash)).resolves.toBe(false);
		});
	});
});

/**
 * The gate every authenticated request passes through.
 *
 * A pending applicant has no session by design, but a token could still
 * exist — minted before an account was moved to PENDING, or obtained some
 * other way. The property under test is that possession of a valid token is
 * not enough: the live record decides, on every request.
 */
describe('verifyActiveToken — an unapproved applicant is refused', () => {
	const buildAuth = (memberStatus: string) => {
		const memberModel: any = {
			findById: jest.fn().mockReturnValue({
				select: () => ({ lean: () => ({ exec: () => Promise.resolve({ memberType: 'AGENT', memberStatus }) }) }),
			}),
		};
		const jwtService: any = {
			verifyAsync: jest
				.fn()
				.mockResolvedValue({ _id: '6aca3daae55f1b0681bdd453', memberNick: 'applicant', memberType: 'AGENT' }),
		};
		return new AuthService(jwtService, memberModel);
	};

	it('rejects a PENDING account even with a valid token', async () => {
		const svc = buildAuth('PENDING');
		await expect(svc.verifyActiveToken('valid.jwt')).rejects.toThrow('AGENT_APPLICATION_PENDING');
	});

	it('still rejects BLOCK and DELETE', async () => {
		await expect(buildAuth('BLOCK').verifyActiveToken('valid.jwt')).rejects.toThrow('ACCOUNT_BLOCKED');
		await expect(buildAuth('DELETE').verifyActiveToken('valid.jwt')).rejects.toThrow('ACCOUNT_DELETED');
	});

	it('lets an approved agent through', async () => {
		const member = await buildAuth('ACTIVE').verifyActiveToken('valid.jwt');
		expect(member.memberType).toBe('AGENT');
	});
});
