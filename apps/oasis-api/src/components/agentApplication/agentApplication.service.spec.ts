import { AgentApplicationService, maskRegistrationNumber } from './agentApplication.service';
import { AgentApplicationStatus } from '../../libs/enums/agentApplication.enum';

/* real ObjectId shapes: the service runs ids through shapeIntoMongoObjectId */
const APPLICATION_ID = '6acc0f9a5b592e1b3001d79a';
const MEMBER_ID = '6aca3daae55f1b0681bdd453';
const ADMIN_ID = '6aca05cae55f1b0681bdd17d';

/**
 * What an application is allowed to do to an account.
 *
 * The properties under test are the ones a reviewer cannot see by reading the
 * screen: that approving is the only thing that activates an agent, that two
 * admins pressing Approve produce one decision rather than two, that the
 * registration number does not travel anywhere it should not, and that the
 * applicant's status credential cannot be pointed at somebody else.
 */
function build(opts: { application?: any; verifyPayload?: any } = {}) {
	const application = opts.application ?? {
		_id: APPLICATION_ID,
		memberId: MEMBER_ID,
		organizationName: 'Seoul Nursery',
		businessRegistrationNumber: '1234567890',
		applicationStatus: AgentApplicationStatus.PENDING,
		createdAt: new Date('2026-10-01T09:00:00Z'),
	};

	const applicationModel: any = {
		create: jest.fn().mockResolvedValue(application),
		findById: jest.fn().mockReturnValue({
			exec: () => Promise.resolve(application),
			select: () => ({
				exec: () => Promise.resolve(application),
				populate: () => ({ lean: () => ({ exec: () => Promise.resolve(application) }) }),
			}),
		}),
		findOne: jest.fn().mockReturnValue({
			sort: () => ({ select: () => ({ lean: () => ({ exec: () => Promise.resolve(application) }) }) }),
			exec: () => Promise.resolve(application),
		}),
		findOneAndUpdate: jest.fn().mockResolvedValue(null),
		exists: jest.fn().mockResolvedValue(true),
		aggregate: jest.fn().mockReturnValue({ exec: () => Promise.resolve([{ list: [], metaCounter: [] }]) }),
	};
	// findOneAndUpdate is called as `.findOneAndUpdate(...).exec()`
	applicationModel.findOneAndUpdate = jest.fn().mockReturnValue({ exec: () => Promise.resolve(application) });

	const memberModel: any = { updateOne: jest.fn().mockReturnValue({ exec: () => Promise.resolve({}) }) };
	const notificationService: any = {
		activeAdminIds: jest.fn().mockResolvedValue(['admin1', 'admin2']),
		record: jest.fn().mockResolvedValue(undefined),
	};
	const authService: any = { invalidateLiveMember: jest.fn() };
	const jwtService: any = {
		signAsync: jest.fn().mockResolvedValue('ticket.jwt'),
		verifyAsync: jest
			.fn()
			.mockResolvedValue(opts.verifyPayload ?? { applicationId: APPLICATION_ID, purpose: 'agent_application' }),
	};

	const svc = new AgentApplicationService(
		applicationModel,
		memberModel,
		notificationService,
		authService,
		jwtService,
	);
	return { svc, applicationModel, memberModel, notificationService, authService, jwtService, application };
}

describe('maskRegistrationNumber', () => {
	it('keeps the last four characters only', () => {
		expect(maskRegistrationNumber('1234567890')).toBe('••••••7890');
		expect(maskRegistrationNumber('')).toBe('');
	});
});

describe('submitting an application', () => {
	it('notifies every active admin without putting the number in the body', async () => {
		const { svc, notificationService } = build();
		await svc.createForSignup({
			memberId: MEMBER_ID as any,
			memberNick: 'applicant',
			organizationName: 'Seoul Nursery',
			businessRegistrationNumber: '123-45-67890',
		});

		const drafts = notificationService.record.mock.calls[0][0];
		expect(drafts).toHaveLength(2);
		expect(drafts[0].notificationType).toBe('AGENT_APPLICATION_SUBMITTED');
		for (const draft of drafts) {
			expect(JSON.stringify(draft)).not.toContain('67890');
			expect(JSON.stringify(draft)).not.toContain('1234567890');
		}
	});

	it('returns a ticket and a masked number, never the real one', async () => {
		const { svc } = build();
		const receipt = await svc.createForSignup({
			memberId: MEMBER_ID as any,
			memberNick: 'applicant',
			organizationName: 'Seoul Nursery',
			businessRegistrationNumber: '1234567890',
		});
		expect(receipt.applicationTicket).toBe('ticket.jwt');
		expect(receipt.state.maskedRegistrationNumber).toBe('••••••7890');
		expect(JSON.stringify(receipt.state)).not.toContain('1234567890');
	});

	it('reuses the existing row when the same signup is submitted twice', async () => {
		const { svc, applicationModel } = build();
		const duplicate: any = new Error('dup');
		duplicate.code = 11000;
		applicationModel.create.mockRejectedValueOnce(duplicate);

		const receipt = await svc.createForSignup({
			memberId: MEMBER_ID as any,
			memberNick: 'applicant',
			organizationName: 'Seoul Nursery',
			businessRegistrationNumber: '1234567890',
		});
		// the second attempt finds the first application rather than writing
		// a second one
		expect(receipt.submitted).toBe(true);
		expect(applicationModel.findOne).toHaveBeenCalled();
	});
});

describe('the applicant status ticket', () => {
	it('refuses a token that is not an application ticket', async () => {
		const { svc } = build({ verifyPayload: { memberId: MEMBER_ID } }); // e.g. an access token
		await expect(svc.stateByTicket('some.jwt')).rejects.toThrow('INVALID_APPLICATION_TICKET');
	});

	it('refuses an empty ticket', async () => {
		const { svc } = build();
		await expect(svc.stateByTicket('')).rejects.toThrow('INVALID_APPLICATION_TICKET');
	});

	it('reads the application id out of the ticket, never from a caller', async () => {
		const { svc, applicationModel } = build();
		await svc.stateByTicket('ticket.jwt');
		expect(applicationModel.findById).toHaveBeenCalledWith(APPLICATION_ID);
	});
});

describe('review', () => {
	it('activates the account only on approval', async () => {
		const { svc, memberModel, authService } = build();
		await svc.review(ADMIN_ID as any, {
			applicationId: APPLICATION_ID as any,
			decision: AgentApplicationStatus.APPROVED,
		} as any);

		const [filter, update] = memberModel.updateOne.mock.calls[0];
		// guarded on PENDING, so a repeated approval cannot resurrect a
		// blocked or deleted account
		expect(filter.memberStatus).toBe('PENDING');
		expect(update.$set.memberStatus).toBe('ACTIVE');
		expect(update.$set.memberType).toBe('AGENT');
		// the live-member cache is dropped so the next request sees it
		expect(authService.invalidateLiveMember).toHaveBeenCalledWith(MEMBER_ID);
	});

	it('does not touch the account on rejection', async () => {
		const { svc, memberModel } = build();
		await svc.review(ADMIN_ID as any, {
			applicationId: APPLICATION_ID as any,
			decision: AgentApplicationStatus.REJECTED,
		} as any);
		expect(memberModel.updateOne).not.toHaveBeenCalled();
	});

	it('refuses a second decision on the same application', async () => {
		const { svc, applicationModel } = build();
		// the guarded update matches nothing because the row is no longer PENDING
		applicationModel.findOneAndUpdate.mockReturnValueOnce({ exec: () => Promise.resolve(null) });
		await expect(
			svc.review(ADMIN_ID as any, {
				applicationId: APPLICATION_ID as any,
				decision: AgentApplicationStatus.APPROVED,
			} as any),
		).rejects.toThrow('APPLICATION_NOT_PENDING');
	});

	it('tells the applicant the decision without the reviewer’s note', async () => {
		const { svc, notificationService } = build();
		await svc.review(ADMIN_ID as any, {
			applicationId: APPLICATION_ID as any,
			decision: AgentApplicationStatus.REJECTED,
			reviewNote: 'Registration number does not match the public registry',
		} as any);

		const [drafts] = notificationService.record.mock.calls[0];
		expect(String(drafts[0].receiverId)).toBe(MEMBER_ID);
		expect(drafts[0].notificationType).toBe('AGENT_APPLICATION_REJECTED');
		expect(JSON.stringify(drafts[0])).not.toContain('public registry');
	});
});

describe('the admin queue', () => {
	it('never projects the registration number', async () => {
		const { svc, applicationModel } = build();
		await svc.listForAdmin({ page: 1, limit: 10 } as any);
		const [pipeline] = applicationModel.aggregate.mock.calls[0];
		const projection = JSON.stringify(pipeline);
		expect(projection).toContain('"businessRegistrationNumber":0');
		expect(projection).toContain('"reviewNote":0');
	});
});
