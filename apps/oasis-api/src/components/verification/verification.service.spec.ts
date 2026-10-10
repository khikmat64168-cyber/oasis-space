import { VerificationService } from './verification.service';
import { normalisePhone, normaliseEmail } from '../../libs/phone';
import * as bcrypt from 'bcryptjs';

/**
 * The OTP flow, exercised without a provider account.
 *
 * What these pin down is the part that cannot be checked by clicking through
 * the UI: that a code is never stored in the clear, that expiry/attempts/
 * single-use are enforced on the SERVER row rather than in the browser, and
 * that the ticket signup accepts cannot be forged or swapped for an access
 * token.
 */
function build(opts: { configured?: boolean; row?: any } = {}) {
	const { configured = true, row = null } = opts;

	const chain = (value: any) => ({
		select: () => chain(value),
		sort: () => chain(value),
		lean: () => chain(value),
		exec: () => Promise.resolve(value),
	});

	const verificationModel: any = {
		findOne: jest.fn(() => chain(row)),
		create: jest.fn().mockResolvedValue({}),
		deleteMany: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
		updateOne: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
	};
	const smsService: any = {
		isConfigured: configured,
		missingConfig: 'SMS_PROVIDER is not set',
		send: jest.fn().mockResolvedValue(undefined),
	};
	const jwtService: any = {
		signAsync: jest.fn().mockResolvedValue('ticket.jwt'),
		verifyAsync: jest.fn(),
	};
	const svc = new VerificationService(verificationModel, smsService, jwtService);
	return { svc, verificationModel, smsService, jwtService };
}

const future = (s: number) => new Date(Date.now() + s * 1000);
const past = (s: number) => new Date(Date.now() - s * 1000);

describe('normalisePhone', () => {
	it('collapses the shapes a Korean number arrives in to one', () => {
		expect(normalisePhone('010-1234-5678')).toBe('+821012345678');
		expect(normalisePhone('01012345678')).toBe('+821012345678');
		expect(normalisePhone('+82 10 1234 5678')).toBe('+821012345678');
		expect(normalisePhone('008210 1234 5678')).toBe('+821012345678');
	});

	it('rejects what cannot be a number', () => {
		expect(normalisePhone('')).toBeNull();
		expect(normalisePhone('abc')).toBeNull();
		expect(normalisePhone('12')).toBeNull();
		expect(normalisePhone('+1234567890123456789')).toBeNull();
	});
});

describe('normaliseEmail', () => {
	it('lowercases and trims', () => {
		expect(normaliseEmail('  Agent@Oasis.SPACE ')).toBe('agent@oasis.space');
	});
	it('keeps a plus address distinct — it is a mailbox the owner chose', () => {
		expect(normaliseEmail('a+oasis@x.com')).toBe('a+oasis@x.com');
	});
	it('rejects malformed input', () => {
		expect(normaliseEmail('no-at-sign')).toBeNull();
		expect(normaliseEmail('a@b')).toBeNull();
	});
});

describe('requestPhoneCode', () => {
	it('refuses, and sends nothing, when no provider is configured', async () => {
		const { svc, smsService, verificationModel } = build({ configured: false });
		await expect(svc.requestPhoneCode('01012345678')).rejects.toThrow('SMS_NOT_CONFIGURED');
		expect(smsService.send).not.toHaveBeenCalled();
		// no row either: an uncompletable verification must not be recorded
		expect(verificationModel.create).not.toHaveBeenCalled();
	});

	it('stores a bcrypt hash, never the code itself', async () => {
		const { svc, verificationModel, smsService } = build();
		await svc.requestPhoneCode('010-1234-5678');
		const [doc] = verificationModel.create.mock.calls[0];
		expect(doc.codeHash).toMatch(/^\$2[aby]\$/);
		expect(doc.phone).toBe('+821012345678');
		// the code is in the message, and the message is not in the document
		const sentBody = smsService.send.mock.calls[0][1];
		const code = sentBody.match(/\b(\d{6})\b/)[1];
		expect(JSON.stringify(doc)).not.toContain(code);
	});

	it('returns no code or hash to the caller', async () => {
		const { svc } = build();
		const res = await svc.requestPhoneCode('01012345678');
		expect(Object.keys(res).sort()).toEqual(['expiresInSeconds', 'resendAfterSeconds']);
	});

	it('refuses a resend inside the cooldown', async () => {
		const { svc, smsService } = build({
			row: { phone: '+821012345678', sendCount: 1, createdAt: past(10), updatedAt: past(10) },
		});
		await expect(svc.requestPhoneCode('01012345678')).rejects.toThrow(/RESEND_TOO_SOON/);
		expect(smsService.send).not.toHaveBeenCalled();
	});

	it('refuses once the per-number send quota is spent', async () => {
		const { svc } = build({
			row: { phone: '+821012345678', sendCount: 5, createdAt: past(120), updatedAt: past(120) },
		});
		await expect(svc.requestPhoneCode('01012345678')).rejects.toThrow('TOO_MANY_REQUESTS');
	});

	it('carries the window start forward so resending cannot reset the quota', async () => {
		const started = past(120);
		const { svc, verificationModel } = build({
			row: { phone: '+821012345678', sendCount: 2, createdAt: started, updatedAt: past(120) },
		});
		await svc.requestPhoneCode('01012345678');
		const [doc] = verificationModel.create.mock.calls[0];
		expect(doc.sendCount).toBe(3);
		expect(doc.createdAt).toBe(started);
	});

	it('records nothing when the provider fails', async () => {
		const { svc, verificationModel, smsService } = build();
		smsService.send.mockRejectedValueOnce(new Error('SMS_SEND_FAILED'));
		await expect(svc.requestPhoneCode('01012345678')).rejects.toThrow();
		expect(verificationModel.create).not.toHaveBeenCalled();
	});

	it('rejects an unusable number before any work happens', async () => {
		const { svc, smsService } = build();
		await expect(svc.requestPhoneCode('nope')).rejects.toThrow('INVALID_PHONE');
		expect(smsService.send).not.toHaveBeenCalled();
	});
});

describe('verifyPhoneCode', () => {
	const rowFor = async (code: string, over: any = {}) => ({
		_id: 'v1',
		phone: '+821012345678',
		codeHash: await bcrypt.hash(code, 4),
		expiresAt: future(300),
		attempts: 0,
		...over,
	});

	it('accepts the right code and mints a purpose-scoped ticket', async () => {
		const { svc, jwtService } = build({ row: await rowFor('123456') });
		const res = await svc.verifyPhoneCode('010-1234-5678', '123456');
		expect(res.verificationTicket).toBe('ticket.jwt');
		const [payload, options] = jwtService.signAsync.mock.calls[0];
		expect(payload).toEqual({ phone: '+821012345678', purpose: 'phone_verification' });
		expect(options.expiresIn).toBeLessThanOrEqual(15 * 60);
	});

	it('marks the row consumed so the same code cannot be replayed', async () => {
		const { svc, verificationModel } = build({ row: await rowFor('123456') });
		await svc.verifyPhoneCode('01012345678', '123456');
		const [, update] = verificationModel.updateOne.mock.calls[0];
		expect(update.$set.consumedAt).toBeInstanceOf(Date);
	});

	it('refuses a code that was already used', async () => {
		const { svc } = build({ row: await rowFor('123456', { consumedAt: past(5) }) });
		await expect(svc.verifyPhoneCode('01012345678', '123456')).rejects.toThrow('CODE_NOT_FOUND');
	});

	it('refuses an expired code even though it is the right one', async () => {
		const { svc } = build({ row: await rowFor('123456', { expiresAt: past(1) }) });
		await expect(svc.verifyPhoneCode('01012345678', '123456')).rejects.toThrow('CODE_EXPIRED');
	});

	it('counts a wrong guess and reports what is left', async () => {
		const { svc, verificationModel } = build({ row: await rowFor('123456') });
		await expect(svc.verifyPhoneCode('01012345678', '000000')).rejects.toThrow('WRONG_CODE:4');
		expect(verificationModel.updateOne).toHaveBeenCalledWith({ _id: 'v1' }, { $inc: { attempts: 1 } });
	});

	it('stops accepting guesses at the ceiling', async () => {
		const { svc } = build({ row: await rowFor('123456', { attempts: 5 }) });
		// even the correct code is refused once the row is burnt
		await expect(svc.verifyPhoneCode('01012345678', '123456')).rejects.toThrow('TOO_MANY_ATTEMPTS');
	});

	it('gives the same answer for a never-requested number as for a missing row', async () => {
		const { svc } = build({ row: null });
		await expect(svc.verifyPhoneCode('01012345678', '123456')).rejects.toThrow('CODE_NOT_FOUND');
	});

	it('rejects a code that is not six digits before touching bcrypt', async () => {
		const { svc, verificationModel } = build({ row: await rowFor('123456') });
		await expect(svc.verifyPhoneCode('01012345678', '12345')).rejects.toThrow('INVALID_CODE');
		expect(verificationModel.findOne).not.toHaveBeenCalled();
	});
});

describe('consumeTicket', () => {
	it('returns the number the ticket was issued for', async () => {
		const { svc, jwtService } = build();
		jwtService.verifyAsync.mockResolvedValue({ phone: '+821012345678', purpose: 'phone_verification' });
		await expect(svc.consumeTicket('t')).resolves.toBe('+821012345678');
	});

	it('refuses an access token presented as a ticket', async () => {
		const { svc, jwtService } = build();
		// a real member token: same secret, no purpose claim
		jwtService.verifyAsync.mockResolvedValue({ _id: 'm1', memberType: 'ADMIN', memberNick: 'x' });
		await expect(svc.consumeTicket('t')).rejects.toThrow('PHONE_NOT_VERIFIED');
	});

	it('refuses an unsigned or expired ticket', async () => {
		const { svc, jwtService } = build();
		jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
		await expect(svc.consumeTicket('t')).rejects.toThrow('PHONE_NOT_VERIFIED');
	});

	it('refuses an empty ticket', async () => {
		const { svc } = build();
		await expect(svc.consumeTicket('')).rejects.toThrow('PHONE_NOT_VERIFIED');
	});
});
