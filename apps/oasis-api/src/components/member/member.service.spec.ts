import { MemberService } from './member.service';

/**
 * Signup's contract with phone verification.
 *
 * The property that matters is that the browser cannot assert anything: there
 * is no `phoneVerified` input, and the number written to the account comes out
 * of the server-signed ticket, not the request body.
 */
function build(
	opts: { smsConfigured?: boolean; ticketPhone?: string | Error; latestApplicationStatus?: string } = {},
) {
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
	const agentApplicationService: any = {
		createForSignup: jest.fn().mockResolvedValue({
			submitted: true,
			applicationTicket: 'application.jwt',
			expiresInSeconds: 1209600,
			state: {
				applicationStatus: 'PENDING',
				organizationName: 'Seoul Nursery',
				maskedRegistrationNumber: '••••7890',
				submittedAt: new Date(),
			},
		}),
		latestStatusFor: jest.fn().mockResolvedValue(opts.latestApplicationStatus ?? 'PENDING'),
	};
	const svc = new MemberService(
		memberModel,
		followModel,
		authService,
		{} as any,
		{} as any,
		verificationService,
		agentApplicationService,
	);
	return { svc, memberModel, authService, verificationService, agentApplicationService };
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

/**
 * The registration path the account is actually created on.
 *
 * Choosing Agent on the form used to produce a client account: the input had
 * no `memberType`, so the schema default won and somebody edited MongoDB by
 * hand afterwards. These pin the three things that fixed it — the request is
 * honoured, an agent is not activated by it, and a client signup cannot carry
 * organisation fields into one.
 */
describe('signup — client and agent are different paths', () => {
	const agentInput = (over: any = {}) =>
		input({
			memberType: 'AGENT',
			organizationName: 'Seoul Nursery',
			businessRegistrationNumber: '123-45-67890',
			verificationTicket: 't',
			...over,
		});

	it('creates a CLIENT as ACTIVE, with a session, and no application', async () => {
		const { svc, memberModel, authService, agentApplicationService } = build();
		const result = await svc.signup(input({ verificationTicket: 't' }) as any);

		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.memberType).toBe('CLIENT');
		expect(doc.memberStatus).toBe('ACTIVE');
		expect(authService.createToken).toHaveBeenCalled();
		expect(agentApplicationService.createForSignup).not.toHaveBeenCalled();
		expect(result.agentApplication).toBeUndefined();
	});

	it('keeps the AGENT request but creates the account PENDING with no token', async () => {
		const { svc, memberModel, authService, agentApplicationService } = build();
		const result = await svc.signup(agentInput() as any);

		const [doc] = memberModel.create.mock.calls[0];
		// the intent is persisted — never downgraded to CLIENT
		expect(doc.memberType).toBe('AGENT');
		// ...but the account cannot be used until an admin approves it
		expect(doc.memberStatus).toBe('PENDING');
		// and no session is handed out
		expect(authService.createToken).not.toHaveBeenCalled();
		expect(result.accessToken).toBeUndefined();
		expect(result.agentApplication?.applicationTicket).toBe('application.jwt');
		expect(agentApplicationService.createForSignup).toHaveBeenCalledWith(
			expect.objectContaining({ organizationName: 'Seoul Nursery', businessRegistrationNumber: '123-45-67890' }),
		);
	});

	it('never writes the organisation fields onto the member document', async () => {
		const { svc, memberModel } = build();
		await svc.signup(agentInput() as any);
		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.organizationName).toBeUndefined();
		expect(doc.businessRegistrationNumber).toBeUndefined();
	});

	it('refuses an agent application with no organisation name', async () => {
		const { svc, memberModel } = build();
		await expect(svc.signup(agentInput({ organizationName: ' ' }) as any)).rejects.toThrow(
			'ORGANIZATION_NAME_REQUIRED',
		);
		expect(memberModel.create).not.toHaveBeenCalled();
	});

	it('refuses a malformed registration number', async () => {
		const { svc, memberModel } = build();
		await expect(svc.signup(agentInput({ businessRegistrationNumber: '!!' }) as any)).rejects.toThrow(
			'BUSINESS_REGISTRATION_NUMBER_INVALID',
		);
		expect(memberModel.create).not.toHaveBeenCalled();
	});

	it('refuses a client signup that carries organisation fields', async () => {
		const { svc, memberModel } = build();
		await expect(
			svc.signup(input({ verificationTicket: 't', organizationName: 'Sneaky Ltd' }) as any),
		).rejects.toThrow('ORGANIZATION_FIELDS_NOT_ALLOWED');
		expect(memberModel.create).not.toHaveBeenCalled();
	});

	it('cannot be used to create an ADMIN', async () => {
		// the input validator permits CLIENT and AGENT only; anything else
		// falls through to the client path rather than being honoured
		const { svc, memberModel } = build();
		await svc.signup(input({ memberType: 'ADMIN', verificationTicket: 't' }) as any);
		const [doc] = memberModel.create.mock.calls[0];
		expect(doc.memberType).toBe('CLIENT');
		expect(doc.memberStatus).toBe('ACTIVE');
	});
});

describe('login — an unapproved applicant gets no session', () => {
	const loginBuild = (memberStatus: string, latestApplicationStatus = 'PENDING') => {
		const ctx = build({ latestApplicationStatus });
		const row: any = {
			_id: 'm1',
			memberNick: 'applicant',
			memberPassword: '$2a$hashed',
			memberStatus,
			memberType: 'AGENT',
		};
		(ctx.memberModel as any).findOne = jest.fn().mockReturnValue({
			select: () => ({ exec: () => Promise.resolve(row) }),
		});
		ctx.authService.comparePassword = jest.fn().mockResolvedValue(true);
		return ctx;
	};

	it('refuses a PENDING application and says so', async () => {
		const { svc, authService } = loginBuild('PENDING');
		await expect(
			svc.login({ memberNick: 'applicant', memberPassword: 'Secret123' } as any),
		).rejects.toThrow('AGENT_APPLICATION_PENDING');
		// no token is minted on the way out
		expect(authService.createToken).not.toHaveBeenCalled();
	});

	it('names a REJECTED application differently', async () => {
		const { svc } = loginBuild('PENDING', 'REJECTED');
		await expect(
			svc.login({ memberNick: 'applicant', memberPassword: 'Secret123' } as any),
		).rejects.toThrow('AGENT_APPLICATION_REJECTED');
	});

	it('checks the application only after the password, so login is not an oracle', async () => {
		const { svc, authService, agentApplicationService } = loginBuild('PENDING');
		authService.comparePassword = jest.fn().mockResolvedValue(false);
		await expect(
			svc.login({ memberNick: 'applicant', memberPassword: 'wrong' } as any),
		).rejects.toThrow();
		// a wrong password never reveals that this nickname is an application
		expect(agentApplicationService.latestStatusFor).not.toHaveBeenCalled();
	});

	it('lets an approved agent through', async () => {
		const { svc, authService } = loginBuild('ACTIVE');
		const result = await svc.login({ memberNick: 'applicant', memberPassword: 'Secret123' } as any);
		expect(authService.createToken).toHaveBeenCalled();
		expect(result.accessToken).toBe('access.jwt');
	});
});
