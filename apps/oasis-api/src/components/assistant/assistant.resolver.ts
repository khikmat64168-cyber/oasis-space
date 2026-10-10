import { Args, Mutation, Query, Resolver, Context } from '@nestjs/graphql';
import { BadRequestException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { AssistantService, RATE_LIMIT_PER_HOUR } from './assistant.service';
import { AssistantAnswer, AssistantCapabilities } from '../../libs/dto/assistant/assistant';
import { AssistantAskInput } from '../../libs/dto/assistant/assistant.input';
import { AssistantIntent } from '../../libs/enums/assistant.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { WithoutGuard } from '../auth/guards/without.guard';
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

	/** What the assistant can do, so the UI never offers what it cannot. */
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
	 * Public on purpose — a visitor can ask about the catalogue before they
	 * have an account. WithoutGuard resolves a member when a token is present
	 * and leaves it null otherwise, and the ORDER intent is the only branch
	 * that needs one. The member id used for order lookup comes from the
	 * verified token here; nothing in the request body can influence it.
	 */
	@UseGuards(WithoutGuard)
	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Mutation(() => AssistantAnswer)
	public async askAssistant(
		@Args('input') input: AssistantAskInput,
		@AuthMember() member: Member | null,
		@Context() context: any,
	): Promise<AssistantAnswer> {
		console.log('Mutation: askAssistant');

		sweep();
		// signed-in callers are limited per account; anonymous ones per address,
		// so one visitor cannot spend everybody's budget
		const ip = String(context?.req?.ip ?? context?.req?.headers?.['x-forwarded-for'] ?? 'anon').split(',')[0].trim();
		const key = member?._id ? `m:${String(member._id)}` : `ip:${ip}`;
		const { allowed, remaining } = takeToken(key);
		if (!allowed) throw new BadRequestException('ASSISTANT_RATE_LIMITED');

		const viewer = member?._id
			? { _id: member._id, memberType: member.memberType as MemberType }
			: null;

		const answer = await this.assistantService.ask(input, viewer);
		return { ...answer, remainingRequests: remaining };
	}
}
