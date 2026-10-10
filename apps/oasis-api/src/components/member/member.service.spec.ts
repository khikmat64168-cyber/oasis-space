import { MemberService } from './member.service';

/**
 * Signup's contract with phone verification.
 *
 * The property that matters is that the browser cannot assert anything: there
 * is no `phoneVerified` input, and the number written to the account comes out
 * of the server-signed ticket, not the request body.
 */
function build(opts: { smsConfigured?: boolean; ticketPhone?: string | Error } = {}) {
	const { smsConfigured = true, ticketPhone = '+821012345678' } = opts;

	const memberModel: any = {
		create: jest.fn().mockImplementation((doc) => Promise.resolve({ ...doc, _id: 'm1' })),
	};
	const followModel: any = {};
	const authService: any = {
		hashPassword: jest.fn().mockResolvedValue('$2a$hashed'),
		createToken: jest.fn().mockResolvedValue('access.jwt'),
	};
	const verificationService: any = {
		smsAvailable: smsConfigured,
		consumeTicket: jest.fn().mockImplementation(() =>
			ticketPhone instanceof Error ? Promise.reject(ticketPhone) : Promise.resolve(ticketPhone),
		),
	};
	const svc = new MemberService(memberModel, followModel, authService, {} as any, {} as any, verificationService);
	return { svc, memberModel, authService, verificationService };
}

const input = (over: any = {}) => ({
	memberNick: 'newmember',
	memberPassword: 'Secret123',
	memberPhone: '010-1234-5678',
	...over,
});

describe('signup — phone verification', () => {
	it('takes the number from the ticket, not from the request body', async () => {
		const { svc, memberModel } = build({ ticketPhone: '+821012345678' });
		// the body claims a different number; the ticket must win
		await svc.signup(input({ memberPhone: '010-0000-0000', verificationTicket: 't' }) as any);
		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.memberPhone).toBe('+821012345678');
		expect(doc.memberPhoneVerified).toBe(true);
	});

	it('refuses when no ticket is presented and SMS is configured', async () => {
		const { svc, memberModel } = build({ ticketPhone: new Error('PHONE_NOT_VERIFIED') });
		await expect(svc.signup(input() as any)).rejects.toThrow('PHONE_NOT_VERIFIED');
		expect(memberModel.create).not.toHaveBeenCalled();
	});

	it('ignores a phoneVerified flag smuggled into the payload', async () => {
		const { svc, memberModel } = build();
		await svc.signup(input({ verificationTicket: 't', memberPhoneVerified: true, memberPhone: 'x' }) as any);
		const [doc] = memberModel.create.mock.calls[0];
		// set from the ticket path, and the number is the ticket's
		expect(doc.memberPhone).toBe('+821012345678');
		expect(doc.memberPhoneVerified).toBe(true);
	});

	it('does not smuggle a forged flag past an unconfigured deployment either', async () => {
		const { svc, memberModel } = build({ smsConfigured: false });
		await svc.signup(input({ memberPhoneVerified: true }) as any);
		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.memberPhoneVerified).toBe(false);
	});

	it('still registers when SMS is switched off, marking the phone unverified', async () => {
		const { svc, memberModel, verificationService } = build({ smsConfigured: false });
		await svc.signup(input() as any);
		expect(verificationService.consumeTicket).not.toHaveBeenCalled();
		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.memberPhone).toBe('+821012345678'); // normalised from the body
		expect(doc.memberPhoneVerified).toBe(false);
	});

	it('never persists the ticket on the member document', async () => {
		const { svc, memberModel } = build();
		await svc.signup(input({ verificationTicket: 'secret.ticket' }) as any);
		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.verificationTicket).toBeUndefined();
	});
});

describe('signup — optional email', () => {
	it('normalises an address that was supplied', async () => {
		const { svc, memberModel } = build();
		await svc.signup(input({ verificationTicket: 't', memberEmail: '  Agent@Oasis.SPACE ' }) as any);
		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.memberEmail).toBe('agent@oasis.space');
		expect(doc.memberEmailVerified).toBe(false);
	});

	it('invents nothing when none was supplied', async () => {
		const { svc, memberModel } = build();
		await svc.signup(input({ verificationTicket: 't' }) as any);
		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.memberEmail).toBeUndefined();
	});

	it('rejects a malformed address rather than storing it', async () => {
		const { svc, memberModel } = build();
		await expect(
			svc.signup(input({ verificationTicket: 't', memberEmail: 'not-an-address' }) as any),
		).rejects.toThrow('INVALID_EMAIL');
		expect(memberModel.create).not.toHaveBeenCalled();
	});
});

describe('signup — password', () => {
	it('hashes before anything is written', async () => {
		const { svc, memberModel, authService } = build();
		await svc.signup(input({ verificationTicket: 't' }) as any);
		expect(authService.hashPassword).toHaveBeenCalledWith('Secret123');
		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.memberPassword).toBe('$2a$hashed');
	});
});
