import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, Length, Min } from 'class-validator';
import type { ObjectId } from 'mongoose';
import { AccessoryCategory, AccessoryStatus, AccessoryType } from '../../enums/accessory.enum';
import { PlantLocation } from '../../enums/plant.enum';

@InputType()
export class AccessoryUpdate {
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
