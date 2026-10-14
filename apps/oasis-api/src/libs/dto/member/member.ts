import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { MemberAuthType, MemberStatus, MemberType } from '../../enums/member.enums';
import { MeLiked } from './like/like';
import { MeFollowed } from './follow/follow';
import { AgentApplicationReceipt } from '../agentApplication/agentApplication';

@ObjectType()
export class Member {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => MemberType)
	memberType!: MemberType;

	@Field(() => MemberStatus)
	memberStatus!: MemberStatus;

	@Field(() => MemberAuthType)
	memberAuthType!: MemberAuthType;

	@Field(() => String)
	memberPhone!: string;

	/** server-set; true only when signup presented a valid verification ticket */
	@Field(() => Boolean, { nullable: true })
	memberPhoneVerified?: boolean;

	@Field(() => String, { nullable: true })
	memberEmail?: string;

	@Field(() => Boolean, { nullable: true })
	memberEmailVerified?: boolean;

	@Field(() => String)
	memberNick!: string;

	memberPassword?: string;

	@Field(() => String, { nullable: true })
	memberFullName?: string;

	@Field(() => String, { nullable: true })
	memberImage?: string;

	@Field(() => String, { nullable: true })
	memberAddress!: string;

	@Field(() => String, { nullable: true })
	memberDesc!: string;

	@Field(() => Int)
	memberPlants!: number;

	@Field(() => Int)
	memberAccessories!: number;

	@Field(() => Int)
	memberArticles!: number;

	@Field(() => Int)
	memberFollowers!: number;

	@Field(() => Int)
	memberFollowings!: number;

	@Field(() => Int)
	memberPoints!: number;

	@Field(() => Int)
	memberLikes!: number;

	@Field(() => Int)
	memberViews!: number;

	@Field(() => Int)
	memberComments!: number;

	@Field(() => Int)
	memberRank!: number;

	@Field(() => Int)
	memberWarnings!: number;

	@Field(() => Int)
	memberBlocks!: number;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt?: Date;

	@Field(() => Date)
	updatedAt?: Date;

	@Field(() => String, { nullable: true })
	accessToken?: string;

	/**
	 * Present on exactly one response: a signup that was an agent
	 * application.
	 *
	 * It carries the receipt — the short-lived status ticket and what the
	 * waiting screen renders — INSTEAD of `accessToken`, which is null in
	 * that case because a pending applicant has no session.
	 */
	@Field(() => AgentApplicationReceipt, { nullable: true })
	agentApplication?: AgentApplicationReceipt;

	//** from aggregasion  **/
	@Field(() => [MeLiked], { nullable: true })
	meLiked?: MeLiked[];

	@Field(() => [MeFollowed], { nullable: true })
	meFollowed?: MeFollowed[];
}

@ObjectType()
export class TotalCounter {
	@Field(() => Int, { nullable: true })
	total?: number;
}
@ObjectType()
export class Members {
	@Field(() => [Member])
	list!: Member[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
