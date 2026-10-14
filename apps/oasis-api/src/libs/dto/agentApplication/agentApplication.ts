import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { AgentApplicationStatus } from '../../enums/agentApplication.enum';
import { Member, TotalCounter } from '../member/member';

/**
 * An agent application as an ADMIN sees it.
 *
 * `businessRegistrationNumber` is nullable on purpose: the list query does
 * not project it and the field comes back null there. Only the single-record
 * admin query asks the database for it, so the full number travels in one
 * response, for one record, to one role.
 */
@ObjectType()
export class AgentApplication {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => String)
	organizationName!: string;

	/** full value — ADMIN detail view only */
	@Field(() => String, { nullable: true })
	businessRegistrationNumber?: string;

	/** always present: last four characters, the rest replaced */
	@Field(() => String)
	maskedRegistrationNumber!: string;

	@Field(() => AgentApplicationStatus)
	applicationStatus!: AgentApplicationStatus;

	@Field(() => String, { nullable: true })
	reviewedBy?: ObjectId;

	@Field(() => Date, { nullable: true })
	reviewedAt?: Date;

	/** the reviewing admin's internal note; never leaves an ADMIN query */
	@Field(() => String, { nullable: true })
	reviewNote?: string;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** joined applicant, so the queue shows a person rather than an id */
	@Field(() => Member, { nullable: true })
	memberData?: Member;
}

@ObjectType()
export class AgentApplications {
	@Field(() => [AgentApplication])
	list!: AgentApplication[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}

/**
 * What an applicant may learn about their own application.
 *
 * Deliberately thin. It carries no member id, no contact details, no review
 * note and no full registration number — only what the waiting screen has to
 * render. It is reachable solely by presenting the signed ticket minted at
 * submission, so it cannot be used to enumerate applicants.
 */
@ObjectType()
export class AgentApplicationState {
	@Field(() => AgentApplicationStatus)
	applicationStatus!: AgentApplicationStatus;

	@Field(() => String)
	organizationName!: string;

	@Field(() => String)
	maskedRegistrationNumber!: string;

	@Field(() => Date)
	submittedAt!: Date;

	@Field(() => Date, { nullable: true })
	reviewedAt?: Date;
}

/** Returned by signup when the request was an agent application. */
@ObjectType()
export class AgentApplicationReceipt {
	@Field(() => Boolean)
	submitted!: boolean;

	/**
	 * Short-lived, signed, and bound to this one application. It is NOT an
	 * access token: it opens exactly one read-only query and nothing else.
	 */
	@Field(() => String)
	applicationTicket!: string;

	@Field(() => Int)
	expiresInSeconds!: number;

	@Field(() => AgentApplicationState)
	state!: AgentApplicationState;
}
