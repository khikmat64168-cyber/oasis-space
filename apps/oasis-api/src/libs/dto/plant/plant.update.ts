import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsNotEmpty, IsOptional, Length, Min } from 'class-validator';
import { PlantCategory, PlantLocation, PlantStatus, PlantType } from '../../enums/plant.enum';
import type { ObjectId } from 'mongoose';

@InputType()
export class PlantUpdate {
	@IsOptional()
	@IsInt()
	@Min(0)
	@Field(() => Int, { nullable: true })
	plantStock?: number;

	@IsNotEmpty()
	@Field(() => String)
	_id!: ObjectId;

	@IsOptional()
	@Field(() => PlantType, { nullable: true })
	plantType?: PlantType;

	@IsOptional()
	@Field(() => PlantCategory, { nullable: true })
	plantCategory?: PlantCategory;

	@IsOptional()
	@Field(() => PlantStatus, { nullable: true })
	plantStatus?: PlantStatus;

	@IsOptional()
	@Field(() => PlantLocation, { nullable: true })
	supplyLocation?: PlantLocation;

	@IsOptional()
	@Length(3, 100)
	@Field(() => String, { nullable: true })
	plantAddress?: string;

	@IsOptional()
	@Length(3, 100)
	@Field(() => String, { nullable: true })
	plantName?: string;

	@IsOptional()
	@Field(() => Number, { nullable: true })
	plantPrice?: number;

	@IsOptional()
	@Min(1)
	@Field(() => Number, { nullable: true })
	plantHeight?: number;

	@IsOptional()
	@Min(1)
	@Field(() => Number, { nullable: true })
	potSize?: number;

	@IsOptional()
	@Min(0)
	@Field(() => Number, { nullable: true })
	deliveryRadius?: number;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	plantImages?: string[];

	@IsOptional()
	@Length(5, 500)
	@Field(() => String, { nullable: true })
	plantDesc?: string;

	soldAt?: Date;

	deletedAt?: Date;
}
