import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { PlantCategory, PlantLocation, PlantStatus, PlantType } from '../../enums/plant.enum';
import { Member, TotalCounter } from '../member/member';
import { MeLiked } from '../member/like/like';

@ObjectType()
export class Plant {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => PlantType)
	plantType!: PlantType;

	@Field(() => PlantCategory)
	plantCategory!: PlantCategory;

	@Field(() => PlantStatus)
	plantStatus!: PlantStatus;

	@Field(() => PlantLocation)
	supplyLocation!: PlantLocation;

	@Field(() => String)
	plantAddress!: string;

	@Field(() => String)
	plantTitle!: string;

	@Field(() => Number)
	plantPrice!: number;

	@Field(() => Number)
	plantHeight!: number;

	@Field(() => Number, { nullable: true })
	potSize?: number;

	@Field(() => Number, { nullable: true })
	deliveryRadius?: number;

	@Field(() => Int)
	plantViews!: number;

	@Field(() => Int)
	plantLikes!: number;

	@Field(() => Int)
	plantComments!: number;

	@Field(() => Int)
	plantRank!: number;

	@Field(() => [String])
	plantImages!: string[];

	@Field(() => String, { nullable: true })
	plantDesc?: string;

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
export class Plants {
	@Field(() => [Plant])
	list!: Plant[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
