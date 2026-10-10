import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, IsOptional, Length, Min } from 'class-validator';
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

	/**
	 * Still accepted so existing callers keep working, but it is NOT what the
	 * account is created with when a ticket is present: the server reads the
	 * number out of the signed ticket. Sending a different number here changes
	 * nothing.
	 */
	@IsNotEmpty()
	@Field(() => String)
	memberPhone!: string;

	/**
	 * Proof that this phone number passed SMS verification, minted by
	 * verifyPhoneCode. Required whenever SMS is configured — see
	 * member.service.signup. There is deliberately no `phoneVerified` boolean
	 * on this input: a client has nothing to assert, only a ticket to present.
	 */
	@IsOptional()
	@Field(() => String, { nullable: true })
	verificationTicket?: string;

	/** optional contact address; not a login identifier */
	@IsOptional()
	@Length(5, 254)
	@Field(() => String, { nullable: true })
	memberEmail?: string;

	/**
	 * Real name. The column already existed on Member and the UI reads
	 * `memberFullName || memberNick` everywhere, but signup had no way to set
	 * it, so every account started with the nickname showing as its name.
	 */
	@IsOptional()
	@Length(2, 60)
	@Field(() => String, { nullable: true })
	memberFullName?: string;

	// NOTE: memberType is intentionally NOT accepted here. Public signup always
	// creates a CLIENT (schema default). AGENT/ADMIN are assigned only by an
	// ADMIN via updateMemberByAdmin — never self-selected at registration.
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
