import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, IsOptional, Length, Min } from 'class-validator';
import type { ObjectId } from 'mongoose';
import { AgentApplicationStatus } from '../../enums/agentApplication.enum';

@InputType()
class AAISearch {
	@IsOptional()
	@Field(() => AgentApplicationStatus, { nullable: true })
	applicationStatus?: AgentApplicationStatus;

	/** matches the organisation name; never the registration number */
	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class AgentApplicationsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@Field(() => AAISearch, { nullable: true })
	search?: AAISearch;
}

/**
 * One review decision.
 *
 * `decision` is restricted to the two terminal states — an ADMIN cannot put
 * an application back into PENDING through this path, because a re-opened
 * review would have to decide what happens to an account that may already
 * have listed plants.
 */
@InputType()
export class AgentApplicationReviewInput {
	@IsNotEmpty()
	@Field(() => String)
	applicationId!: ObjectId;

	@IsNotEmpty()
	@IsIn([AgentApplicationStatus.APPROVED, AgentApplicationStatus.REJECTED])
	@Field(() => AgentApplicationStatus)
	decision!: AgentApplicationStatus;

	/** internal note; stored, shown to admins, never shown to the applicant */
	@IsOptional()
	@Length(1, 500)
	@Field(() => String, { nullable: true })
	reviewNote?: string;
}
