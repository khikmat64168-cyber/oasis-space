import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AssistantService, RATE_LIMIT_PER_HOUR } from './assistant.service';
import { AssistantAnswer, AssistantCapabilities } from '../../libs/dto/assistant/assistant';
import { AssistantAskInput } from '../../libs/dto/assistant/assistant.input';
import { AssistantIntent } from '../../libs/enums/assistant.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Member } from '../../libs/dto/member/member';
import { MemberType } from '../../libs/enums/member.enums';

/**
 * A fixed-window counter, in memory.
 *
 * Enough for one API process, which is what this deployment runs. It is not
 * shared across instances — noted in docs/ai-assistant.md — but it is a real
 * limit rather than a comment promising one, and it is the server that counts,
 * so a client cannot opt out of it.
 */
const WINDOW_MS = 60 * 60 * 1000;
const buckets = new Map<string, { count: number; resetAt: number }>();

const takeToken = (key: string): { allowed: boolean; remaining: number } => {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return { allowed: true, remaining: RATE_LIMIT_PER_HOUR - 1 };
	}
	if (bucket.count >= RATE_LIMIT_PER_HOUR) return { allowed: false, remaining: 0 };
	bucket.count += 1;
	return { allowed: true, remaining: RATE_LIMIT_PER_HOUR - bucket.count };
};

/** keeps the map from growing without bound on a long-lived process */
const sweep = () => {
	const now = Date.now();
	for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
};

@Resolver()
export class AssistantResolver {
	constructor(private readonly assistantService: AssistantService) {}

	/**
	 * What the assistant can do, so the UI never offers what it cannot.
	 *
	 * Behind the guard with the rest of it: the assistant is a members-only
	 * feature now, and a signed-out caller has nothing to ask this for.
	 */
	@UseGuards(AuthGuard)
	@Query(() => AssistantCapabilities)
	public async getAssistantCapabilities(): Promise<AssistantCapabilities> {
		return {
			generation: this.assistantService.generationAvailable,
			// structured answers need no model and are always available
			retrieval: true,
			supportedIntents: Object.values(AssistantIntent).filter(
				(i) => i !== AssistantIntent.UNKNOWN_OR_UNSUPPORTED && i !== AssistantIntent.GREETING,
			),
		};
	}

	/**
	 * Ask the assistant.
	 *
	 * Members only.
	 *
	 * It used to be public — WithoutGuard resolved a member when a token was
	 * present and left it null otherwise, so a visitor could ask about the
	 * catalogue before they had an account. That is a product decision, and
	 * it was reversed: the assistant is now behind a sign-in, and the UI
	 * hides it for exactly the same reason. Hiding it is presentation; THIS
	 * is the rule, because a hidden widget is still one fetch call away.
	 *
	 * The member id used for order lookup comes from the verified token;
	 * nothing in the request body can influence it.
	 */
	@UseGuards(AuthGuard)
	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Mutation(() => AssistantAnswer)
	public async askAssistant(
		@Args('input') input: AssistantAskInput,
		@AuthMember() member: Member,
	): Promise<AssistantAnswer> {
		console.log('Mutation: askAssistant');

		sweep();
		/*
		 * One budget per account.
		 *
		 * The anonymous branch — a window keyed by IP address — is gone with
		 * the anonymous caller: every request that reaches this line now
		 * carries a verified member, so there is no longer a case where a
		 * shared address has to stand in for an identity.
		 */
		const { allowed, remaining } = takeToken(`m:${String(member._id)}`);
		if (!allowed) throw new BadRequestException('ASSISTANT_RATE_LIMITED');

		const viewer = { _id: member._id, memberType: member.memberType as MemberType };

		const answer = await this.assistantService.ask(input, viewer);
		return { ...answer, remainingRequests: remaining };
	}
}
