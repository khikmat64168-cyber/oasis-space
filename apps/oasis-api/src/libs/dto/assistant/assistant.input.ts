import { Field, InputType } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, IsOptional, Length } from 'class-validator';

/**
 * Page context is a HINT, never an authorisation.
 *
 * The server re-reads whatever entity these ids name through the normal
 * services, with the caller's own identity, so a forged plantId buys nothing
 * that a direct query would not already allow.
 */
@InputType()
export class AssistantContextInput {
	@IsOptional()
	@IsIn(['home', 'plants', 'plant', 'agents', 'agent', 'map', 'community', 'article', 'cs', 'orders'])
	@Field(() => String, { nullable: true })
	page?: string;

	@IsOptional()
	@Length(24, 24)
	@Field(() => String, { nullable: true })
	plantId?: string;

	@IsOptional()
	@Length(24, 24)
	@Field(() => String, { nullable: true })
	agentId?: string;

	@IsOptional()
	@Length(24, 24)
	@Field(() => String, { nullable: true })
	articleId?: string;
}

@InputType()
export class AssistantAskInput {
	/* bounded at both ends: an empty string is not a question, and a very long
	   one is either an accident or an attempt to run up a token bill */
	@IsNotEmpty()
	@Length(2, 500)
	@Field(() => String)
	question!: string;

	@IsOptional()
	@Field(() => AssistantContextInput, { nullable: true })
	context?: AssistantContextInput;

	/**
	 * The last few turns, sent by the client. Treated purely as text for the
	 * prompt — it can never widen what the tools return, which are driven by
	 * the current question and the authenticated caller.
	 */
	@IsOptional()
	@Field(() => [String], { nullable: true })
	history?: string[];
}
