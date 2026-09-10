import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, IsOptional, Length, Min, min } from 'class-validator';
import { MemberAuthType, MemberStatus, MemberType } from '../../enums/member.enums';
import { availableAgentsSorts, availableMembersSorts } from '../../config';
import { Direction } from '../../Errors';

@InputType()
export class MemberInput {
	@IsNotEmpty()
	@Length(3, 12)
	@Field(() => String)
	memberNick!: string;

	@IsNotEmpty()
	@Length(5, 12)
	@Field(() => String)
	memberPassword!: string;

	@IsNotEmpty()
	@Field(() => String)
	memberPhone!: string;

	@IsOptional()
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;

	@IsOptional()
	@Field(() => MemberAuthType, { nullable: true })
	memberAuthType?: MemberAuthType;
}

@InputType()
export class LoginInput {
	@IsNotEmpty()
	@Length(3, 12)
	@Field(() => String)
	memberNick!: string;

	@IsNotEmpty()
	@Length(5, 12)
	@Field(() => String)
	memberPassword!: string;
}

@InputType()
export class MemberUpdateInput {
	@IsNotEmpty()
	@Field(() => String)
	_id!: string;

	@IsOptional()
	@Field(() => MemberStatus, { nullable: true })
	memberStatus?: MemberStatus;

	@IsOptional()
	@Field(() => MemberType, { nullable: true })
	memberType?: MemberType;
}

@InputType()
class AISearch {
	@IsNotEmpty()
	@Field(() => String, { nullable: true })
	text!: string;
}

@InputType()
export class AgentsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableAgentsSorts)
	@Field(() => String, { nullable: true })
	sort!: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction!: Direction;

	@IsOptional()
	@Field(() => AISearch, { nullable: true })
	search!: AISearch;
}

@InputType()
class MISearch {
	@IsOptional()
	@Field(() => MemberStatus, { nullable: true })
	memberStatus!: MemberStatus;

	@IsOptional()
	@Field(() => MemberType, { nullable: true })
	memberType!: MemberType;

	@IsOptional()
	@Field(() => String, { nullable: true })
	text!: string;
}

@InputType()
export class MembersInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableMembersSorts)
	@Field(() => String, { nullable: true })
	sort!: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction!: Direction;

	@IsOptional()
	@Field(() => MISearch, { nullable: true })
	search!: MISearch;
}
