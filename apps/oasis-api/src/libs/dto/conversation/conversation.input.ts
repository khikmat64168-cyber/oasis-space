import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsNotEmpty, IsOptional, Length, Min } from 'class-validator';

/** The first message to an agent; creates the thread or continues the existing one. */
@InputType()
export class StartConversationInput {
	@IsNotEmpty()
	@Field(() => String)
	agentId!: string;

	@IsNotEmpty()
	@Length(2, 1000)
	@Field(() => String)
	text!: string;

	/** set when the question was asked from a plant page */
	@IsOptional()
	@Field(() => String, { nullable: true })
	plantId?: string;
}

/** A reply inside a thread the caller already participates in. */
@InputType()
export class SendMessageInput {
	@IsNotEmpty()
	@Field(() => String)
	conversationId!: string;

	@IsNotEmpty()
	@Length(1, 1000)
	@Field(() => String)
	text!: string;
}

@InputType()
export class ConversationsInquiry {
	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Field(() => Int)
	limit!: number;
}

@InputType()
export class MessagesInquiry {
	@IsNotEmpty()
	@Field(() => String)
	conversationId!: string;

	@IsInt()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsInt()
	@Min(1)
	@Field(() => Int)
	limit!: number;
}
