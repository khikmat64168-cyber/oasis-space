import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { AccessoryCategory, AccessoryStatus, AccessoryType } from '../../enums/accessory.enum';
import { PlantLocation } from '../../enums/plant.enum';
import { Member, TotalCounter } from '../member/member';
import { MeLiked } from '../member/like/like';

@ObjectType()
export class Accessory {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => AccessoryType)
	accessoryType!: AccessoryType;

	@Field(() => AccessoryCategory)
	accessoryCategory!: AccessoryCategory;

	@Field(() => AccessoryStatus)
	accessoryStatus!: AccessoryStatus;

	@Field(() => String)
	accessoryName!: string;

	@Field(() => Number)
	accessoryPrice!: number;

	@Field(() => String, { nullable: true })
	accessoryBrand?: string;

	@Field(() => [String])
	accessoryImages!: string[];

	@Field(() => String, { nullable: true })
	accessoryDesc?: string;

	@Field(() => PlantLocation)
	supplyLocation!: PlantLocation;

	@Field(() => Number, { nullable: true })
	deliveryRadius?: number;

	/** units the agent currently has on hand */
	@Field(() => Int)
	accessoryStock!: number;

	@Field(() => Int)
	accessoryViews!: number;

	@Field(() => Int)
	accessoryLikes!: number;

	@Field(() => Int)
	accessoryComments!: number;

	@Field(() => Int)
	accessoryRank!: number;

	@Field(() => String)
	memberId!: ObjectId;

	@Field(() => Date, { nullable: true })
	soldAt?: Date;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** from aggregation **/

	@Field(() => Member, { nullable: true })
	memberData?: Member;

	@Field(() => [MeLiked], { nullable: true })
	meLiked?: MeLiked[];
}

@ObjectType()
export class Accessories {
	@Field(() => [Accessory])
	list!: Accessory[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
