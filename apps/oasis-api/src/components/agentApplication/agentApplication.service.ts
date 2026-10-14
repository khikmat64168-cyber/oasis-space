import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, ObjectId } from 'mongoose';
import {
	AgentApplication,
	AgentApplicationReceipt,
	AgentApplicationState,
	AgentApplications,
} from '../../libs/dto/agentApplication/agentApplication';
import {
	AgentApplicationReviewInput,
	AgentApplicationsInquiry,
} from '../../libs/dto/agentApplication/agentApplication.input';
import { AgentApplicationStatus } from '../../libs/enums/agentApplication.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enums';
import { NotificationType } from '../../libs/enums/notification.enum';
import { Member } from '../../libs/dto/member/member';
import { NotificationService } from '../notification/notification.service';
import { AuthService } from '../auth/auth.service';
import { shapeIntoMongoObjectId } from '../../libs/config';
import { T } from '../../libs/types/common';

/** How long the applicant's status ticket is accepted. */
const TICKET_TTL_SECONDS = 60 * 60 * 24 * 14;
const TICKET_PURPOSE = 'agent_application';

/**
 * Last four characters, the rest replaced.
 *
 * Everything except the ADMIN detail view sees this form — the queue, the
 * applicant's own waiting screen, and every notification body. Four is enough
 * for an admin to recognise a number they are already looking at and useless
 * to anyone who is not.
 */
export const maskRegistrationNumber = (value?: string): string => {
	const raw = String(value ?? '').trim();
	if (!raw) return '';
	const tail = raw.slice(-4);
	return `${'•'.repeat(Math.max(3, raw.length - 4))}${tail}`;
};

@Injectable()
export class AgentApplicationService {
	private readonly logger = new Logger(AgentApplicationService.name);

	constructor(
		@InjectModel('AgentApplication') private readonly applicationModel: Model<T>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly notificationService: NotificationService,
		private readonly authService: AuthService,
		private readonly jwtService: JwtService,
	) {}

	/**
	 * Record an application for an account that has just been created PENDING.
	 *
	 * Called from signup, inside the same request, so a member row can never
	 * be left marked PENDING with no application behind it to review.
	 */
	public async createForSignup(input: {
		memberId: ObjectId;
		memberNick: string;
		organizationName: string;
		businessRegistrationNumber: string;
	}): Promise<AgentApplicationReceipt> {
		const organizationName = input.organizationName.trim();
		const registrationNumber = input.businessRegistrationNumber.replace(/\s+/g, '');

		let application: T;
		try {
			application = await this.applicationModel.create({
				memberId: input.memberId,
				organizationName,
				businessRegistrationNumber: registrationNumber,
				applicationStatus: AgentApplicationStatus.PENDING,
			});
		} catch (err) {
			// the partial unique index on (memberId, PENDING): a retried or
			// double-submitted signup finds the row it already wrote rather
			// than writing a second one
			if (err instanceof Error && 'code' in err && (err as T).code === 11000) {
				const existing = await this.applicationModel
					.findOne({ memberId: input.memberId, applicationStatus: AgentApplicationStatus.PENDING })
					.exec();
				if (!existing) throw new BadRequestException('APPLICATION_NOT_RECORDED');
				application = existing as T;
			} else {
				throw err;
			}
		}

		/*
		 * Tell the admins.
		 *
		 * Awaited, not fired and forgotten: the applicant is about to be shown
		 * a screen that says their application is waiting for review, and that
		 * sentence has to be true. The registration number is NOT in the body
		 * — a notification preview is the one place it would travel furthest.
		 */
		const adminIds = await this.notificationService.activeAdminIds();
		await this.notificationService.record(
			adminIds.map((adminId) => ({
				receiverId: adminId,
				senderId: input.memberId,
				notificationType: NotificationType.AGENT_APPLICATION_SUBMITTED,
				notificationTitle: 'New agent application',
				notificationDesc: `${input.memberNick} applied on behalf of ${organizationName}`,
			})),
		);

		return {
			submitted: true,
			applicationTicket: await this.issueTicket(application._id),
			expiresInSeconds: TICKET_TTL_SECONDS,
			state: this.toState(application),
		};
	}

	/**
	 * The applicant's own view of their application.
	 *
	 * Authorised by a signed ticket bound to one application id, never by an
	 * id passed in by the caller: there is no request shape here that lets
	 * somebody walk the collection.
	 */
	public async stateByTicket(ticket: string): Promise<AgentApplicationState> {
		const applicationId = await this.readTicket(ticket);
		/*
		 * The number is asked for explicitly because the schema hides it —
		 * and it is read ONLY to compute the mask below. The full value never
		 * leaves this method; `toState` returns the masked form.
		 */
		const application = await this.applicationModel
			.findById(applicationId)
			.select('+businessRegistrationNumber')
			.exec();
		if (!application) throw new NotFoundException('APPLICATION_NOT_FOUND');
		return this.toState(application);
	}

	/** ADMIN: the review queue. Never projects the registration number. */
	public async listForAdmin(inquiry: AgentApplicationsInquiry): Promise<AgentApplications> {
		const match: T = {};
		if (inquiry.search?.applicationStatus) match.applicationStatus = inquiry.search.applicationStatus;
		if (inquiry.search?.text) match.organizationName = { $regex: new RegExp(escapeRegex(inquiry.search.text), 'i') };

		const result = await this.applicationModel
			.aggregate([
				{ $match: match },
				{ $sort: { createdAt: -1 } },
				{
					$facet: {
						list: [
							{ $skip: (inquiry.page - 1) * inquiry.limit },
							{ $limit: inquiry.limit },
							{
								$lookup: {
									from: 'members',
									localField: 'memberId',
									foreignField: '_id',
									as: 'memberData',
								},
							},
							{ $unwind: { path: '$memberData', preserveNullAndEmptyArrays: true } },
							// the number is select:false on the schema, but an
							// aggregation ignores that — so it is dropped here
							{ $project: { businessRegistrationNumber: 0, reviewNote: 0, 'memberData.memberPassword': 0 } },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		const page = result[0] ?? { list: [], metaCounter: [] };
		return {
			list: page.list.map((row: T) => ({ ...row, maskedRegistrationNumber: '' })),
			metaCounter: page.metaCounter,
		};
	}

	/**
	 * ADMIN: one application, with the full registration number.
	 *
	 * The only path in the product that returns it. Asked for explicitly,
	 * because the schema hides it by default.
	 */
	public async getForAdmin(applicationId: ObjectId): Promise<AgentApplication> {
		const application = await this.applicationModel
			.findById(applicationId)
			.select('+businessRegistrationNumber +reviewNote')
			.populate('memberId')
			.lean<T>()
			.exec();
		if (!application) throw new NotFoundException('APPLICATION_NOT_FOUND');

		return {
			...(application as T),
			memberData: application.memberId as T,
			memberId: (application.memberId as T)?._id ?? application.memberId,
			maskedRegistrationNumber: maskRegistrationNumber(application.businessRegistrationNumber),
		} as AgentApplication;
	}

	/**
	 * ADMIN: decide.
	 *
	 * The transition is a single guarded update — `applicationStatus:
	 * PENDING` is part of the filter, so two admins pressing Approve at the
	 * same moment produce one winner and one NOT_PENDING, rather than two
	 * writes and an account whose state depends on which landed last.
	 */
	public async review(adminId: ObjectId, input: AgentApplicationReviewInput): Promise<AgentApplication> {
		const applicationId = shapeIntoMongoObjectId(input.applicationId);

		const application = await this.applicationModel
			.findOneAndUpdate(
				{ _id: applicationId, applicationStatus: AgentApplicationStatus.PENDING },
				{
					$set: {
						applicationStatus: input.decision,
						reviewedBy: adminId,
						reviewedAt: new Date(),
						...(input.reviewNote ? { reviewNote: input.reviewNote.trim() } : {}),
					},
				},
				{ new: true },
			)
			.exec();

		if (!application) {
			// either it does not exist or somebody already decided it
			const exists = await this.applicationModel.exists({ _id: applicationId });
			throw new BadRequestException(exists ? 'APPLICATION_NOT_PENDING' : 'APPLICATION_NOT_FOUND');
		}

		if (input.decision === AgentApplicationStatus.APPROVED) {
			/*
			 * The account becomes usable here and nowhere else.
			 *
			 * Guarded on PENDING for the same reason as above, and the live
			 * member cache is dropped straight after so the next request sees
			 * the new status rather than waiting out the 10s TTL.
			 */
			await this.memberModel
				.updateOne(
					{ _id: application.memberId, memberStatus: MemberStatus.PENDING },
					{ $set: { memberStatus: MemberStatus.ACTIVE, memberType: MemberType.AGENT } },
				)
				.exec();
			this.authService.invalidateLiveMember(String(application.memberId));
		}

		await this.notificationService.record([
			{
				receiverId: application.memberId,
				senderId: adminId,
				notificationType:
					input.decision === AgentApplicationStatus.APPROVED
						? NotificationType.AGENT_APPLICATION_APPROVED
						: NotificationType.AGENT_APPLICATION_REJECTED,
				notificationTitle:
					input.decision === AgentApplicationStatus.APPROVED
						? 'Your agent account is approved'
						: 'Your agent application was not approved',
				// the applicant is told the decision; the reviewer's note is not
				// theirs to read
				notificationDesc: application.organizationName,
			},
		]);

		this.logger.log(`Agent application ${applicationId} ${input.decision.toLowerCase()} by ${adminId}`);
		return this.getForAdmin(applicationId as ObjectId);
	}

	/**
	 * The newest application's status for a member, or null.
	 *
	 * Login uses it to tell a pending applicant apart from a rejected one,
	 * which are the same member status but a different thing to say.
	 */
	public async latestStatusFor(memberId: ObjectId): Promise<AgentApplicationStatus | null> {
		const row = await this.applicationModel
			.findOne({ memberId })
			.sort({ createdAt: -1 })
			.select('applicationStatus')
			.lean<T>()
			.exec();
		return (row?.applicationStatus as AgentApplicationStatus) ?? null;
	}

	/* ---------------------------------------------------------------- */

	private toState(application: T): AgentApplicationState {
		return {
			applicationStatus: application.applicationStatus,
			organizationName: application.organizationName,
			maskedRegistrationNumber: maskRegistrationNumber(application.businessRegistrationNumber),
			submittedAt: application.createdAt,
			reviewedAt: application.reviewedAt ?? undefined,
		};
	}

	private async issueTicket(applicationId: ObjectId): Promise<string> {
		return this.jwtService.signAsync(
			{ applicationId: String(applicationId), purpose: TICKET_PURPOSE },
			{ expiresIn: TICKET_TTL_SECONDS },
		);
	}

	/** Reads a ticket back, refusing anything that is not one of ours. */
	private async readTicket(ticket: string): Promise<string> {
		if (!ticket) throw new BadRequestException('INVALID_APPLICATION_TICKET');
		let payload: T;
		try {
			payload = await this.jwtService.verifyAsync(ticket);
		} catch {
			throw new BadRequestException('INVALID_APPLICATION_TICKET');
		}
		// a normal access token is signed by the same key: the purpose claim
		// is what stops one being presented here
		if (payload?.purpose !== TICKET_PURPOSE || !payload?.applicationId) {
			throw new BadRequestException('INVALID_APPLICATION_TICKET');
		}
		return payload.applicationId;
	}
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
