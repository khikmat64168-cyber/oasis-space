import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { Member, TotalCounter } from '../member/member';

@ObjectType()
export class ConversationMessage {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	conversationId!: ObjectId;

	@Field(() => String)
	senderId!: ObjectId;

	@Field(() => String)
	text!: string;

	@Field(() => Date, { nullable: true })
	readAt?: Date;

	@Field(() => Date)
	createdAt!: Date;
}

@ObjectType()
export class ConversationMessages {
	@Field(() => [ConversationMessage])
	list!: ConversationMessage[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter?: TotalCounter[];
}

@ObjectType()
export class Conversation {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	clientId!: ObjectId;

	@Field(() => String)
	agentId!: ObjectId;

	@Field(() => String, { nullable: true })
	plantId?: ObjectId;

	@Field(() => Date)
	lastMessageAt!: Date;

	@Field(() => String, { nullable: true })
	lastMessagePreview?: string;

	@Field(() => String, { nullable: true })
	lastSenderId?: ObjectId;

	@Field(() => Date)
	createdAt!: Date;

	/**
	 * Unread count for the CALLER, resolved per request. The stored document
	 * keeps a counter per side; exposing both would let either participant
	 * read the other's badge, which is not theirs to see.
	 */
	@Field(() => Int)
	unread!: number;

	/** the other participant, filled by aggregation */
	@Field(() => Member, { nullable: true })
	partner?: Member;
}

@ObjectType()
export class Conversations {
	@Field(() => [Conversation])
	list!: Conversation[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter?: TotalCounter[];
}
