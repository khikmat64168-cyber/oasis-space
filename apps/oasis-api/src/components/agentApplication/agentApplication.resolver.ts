import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException, UseGuards } from '@nestjs/common';
import type { ObjectId } from 'mongoose';
import { AgentApplicationService } from './agentApplication.service';
import {
	AgentApplication,
	AgentApplicationState,
	AgentApplications,
} from '../../libs/dto/agentApplication/agentApplication';
import {
	AgentApplicationReviewInput,
	AgentApplicationsInquiry,
} from '../../libs/dto/agentApplication/agentApplication.input';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enums';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { shapeIntoMongoObjectId } from '../../libs/config';

/**
 * A fixed window per ticket, in memory.
 *
 * The waiting screen polls, so the status query is the one operation here an
 * anonymous caller can reach. One process holds this deployment, which is the
 * same assumption the assistant's limiter already makes.
 */
const STATUS_WINDOW_MS = 60_000;
const STATUS_MAX_PER_WINDOW = 12;
const statusHits = new Map<string, { count: number; resetAt: number }>();

const takeStatusToken = (key: string): boolean => {
	const now = Date.now();
	const entry = statusHits.get(key);
	if (!entry || entry.resetAt <= now) {
		statusHits.set(key, { count: 1, resetAt: now + STATUS_WINDOW_MS });
		return true;
	}
	if (entry.count >= STATUS_MAX_PER_WINDOW) return false;
	entry.count += 1;
	return true;
};

@Resolver()
export class AgentApplicationResolver {
	constructor(private readonly agentApplicationService: AgentApplicationService) {}

	/**
	 * The applicant's waiting screen.
	 *
	 * Deliberately NOT behind AuthGuard: a pending applicant has no session
	 * by design, and issuing one so they could watch a status would be the
	 * very thing this workflow exists to prevent. Authorisation is the signed
	 * ticket minted at submission, which opens this one read and nothing
	 * else.
	 */
	@Query(() => AgentApplicationState)
	public async getAgentApplicationState(
		@Args('applicationTicket') applicationTicket: string,
	): Promise<AgentApplicationState> {
		console.log('Query: getAgentApplicationState');
		// keyed by the ticket, so one applicant's polling cannot exhaust
		// anybody else's allowance
		if (!takeStatusToken(applicationTicket.slice(-32))) {
			throw new BadRequestException('APPLICATION_STATUS_RATE_LIMITED');
		}
		return this.agentApplicationService.stateByTicket(applicationTicket);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => AgentApplications)
	public async getAgentApplicationsByAdmin(
		@Args('input') input: AgentApplicationsInquiry,
	): Promise<AgentApplications> {
		console.log('Query: getAgentApplicationsByAdmin');
		return this.agentApplicationService.listForAdmin(input);
	}

	/** the only path that returns the full registration number */
	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => AgentApplication)
	public async getAgentApplicationByAdmin(
		@Args('applicationId') applicationId: string,
	): Promise<AgentApplication> {
		console.log('Query: getAgentApplicationByAdmin');
		return this.agentApplicationService.getForAdmin(shapeIntoMongoObjectId(applicationId));
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => AgentApplication)
	public async reviewAgentApplicationByAdmin(
		@Args('input') input: AgentApplicationReviewInput,
		@AuthMember('_id') adminId: ObjectId,
	): Promise<AgentApplication> {
		console.log('Mutation: reviewAgentApplicationByAdmin');
		return this.agentApplicationService.review(adminId, input);
	}
}
