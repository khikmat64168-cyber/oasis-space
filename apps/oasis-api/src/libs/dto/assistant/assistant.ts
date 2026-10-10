import { Field, Int, ObjectType } from '@nestjs/graphql';
import { AssistantIntent, AssistantSourceType } from '../../enums/assistant.enum';

/**
 * One citation. `href` is built from the entity's real id by the server, never
 * by the model, so a link can only point at a record that was actually read.
 */
@ObjectType()
export class AssistantSource {
	@Field(() => String)
	id!: string;

	@Field(() => String)
	title!: string;

	@Field(() => AssistantSourceType)
	type!: AssistantSourceType;

	@Field(() => String)
	href!: string;
}

@ObjectType()
export class AssistantAnswer {
	@Field(() => String)
	answer!: string;

	/** only passages that were genuinely retrieved and verified */
	@Field(() => [AssistantSource])
	sources!: AssistantSource[];

	@Field(() => AssistantIntent)
	intent!: AssistantIntent;

	/**
	 * False when nothing relevant was found. The client uses this to avoid
	 * presenting a "no evidence" reply with the confidence of a sourced one.
	 */
	@Field(() => Boolean)
	grounded!: boolean;

	/** true when a language model wrote the prose; false when the server did */
	@Field(() => Boolean)
	generated!: boolean;

	@Field(() => Int, { nullable: true })
	remainingRequests?: number;
}

/** What the assistant can do right now, so the UI never offers what it cannot. */
@ObjectType()
export class AssistantCapabilities {
	/** false when no model provider is configured */
	@Field(() => Boolean)
	generation!: boolean;

	/** structured answers work without a model and are always available */
	@Field(() => Boolean)
	retrieval!: boolean;

	@Field(() => [AssistantIntent])
	supportedIntents!: AssistantIntent[];
}
