import { Field, InputType, Int } from '@nestjs/graphql';
import { ArrayNotEmpty, IsEnum, IsInt, IsNotEmpty, IsOptional, Length, Min } from 'class-validator';
import type { ObjectId } from 'mongoose';
import { AccessoryCategory, AccessoryStatus, AccessoryType } from '../../enums/accessory.enum';
import { PlantLocation, PlantType } from '../../enums/plant.enum';

@InputType()
export class AccessoryUpdate {
	@IsOptional()
	@IsInt()
	@Min(0)
	@Field(() => Int, { nullable: true })
	accessoryStock?: number;

	@IsNotEmpty()
	@Field(() => String)
	_id!: ObjectId;

	@IsOptional()
	@Field(() => AccessoryType, { nullable: true })
	accessoryType?: AccessoryType;

	@IsOptional()
	@Field(() => AccessoryCategory, { nullable: true })
	accessoryCategory?: AccessoryCategory;

	@IsOptional()
	@Field(() => AccessoryStatus, { nullable: true })
	accessoryStatus?: AccessoryStatus;

	@IsOptional()
	@Length(3, 100)
	@Field(() => String, { nullable: true })
	accessoryName?: string;

	@IsOptional()
	@Field(() => Number, { nullable: true })
	accessoryPrice?: number;

	@IsOptional()
	@Length(1, 60)
	@Field(() => String, { nullable: true })
	accessoryBrand?: string;

	@IsOptional()
	@Field(() => [String], { nullable: true })
	accessoryImages?: string[];

	@IsOptional()
	@Length(5, 500)
	@Field(() => String, { nullable: true })
	accessoryDesc?: string;

	/* Optional here — an update that does not mention compatibility leaves it
	   alone — but if it is sent it must still be a non-empty list of real
	   PlantType members. */
	@IsOptional()
	@ArrayNotEmpty()
	@IsEnum(PlantType, { each: true })
	@Field(() => [PlantType], { nullable: true })
	compatiblePlantTypes?: PlantType[];

	@IsOptional()
	@Field(() => PlantLocation, { nullable: true })
	supplyLocation?: PlantLocation;

	@IsOptional()
	@Min(0)
	@Field(() => Number, { nullable: true })
	deliveryRadius?: number;

	soldAt?: Date;

	deletedAt?: Date;
}
