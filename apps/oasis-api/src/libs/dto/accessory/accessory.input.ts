import { Field, InputType, Int } from '@nestjs/graphql';
import { ArrayNotEmpty, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, Length, Min } from 'class-validator';
import type { ObjectId } from 'mongoose';
import { AccessoryCategory, AccessoryStatus, AccessoryType } from '../../enums/accessory.enum';
import { PlantLocation, PlantType } from '../../enums/plant.enum';
import { Direction } from '../../Errors';
import { availableAccessorySorts } from '../../config';
// reuse the already-registered generic ranges (avoids duplicate GraphQL type names)
import { PricesRange, PeriodsRange } from '../plant/plant.input';

@InputType()
export class AccessoryInput {
	@IsOptional()
	@IsInt()
	@Min(0)
	@Field(() => Int, { nullable: true })
	accessoryStock?: number;

	@IsNotEmpty()
	@Field(() => AccessoryType)
	accessoryType!: AccessoryType;

	@IsNotEmpty()
	@Field(() => AccessoryCategory)
	accessoryCategory!: AccessoryCategory;

	@IsNotEmpty()
	@Length(3, 100)
	@Field(() => String)
	accessoryName!: string;

	@IsNotEmpty()
	@Field(() => Number)
	accessoryPrice!: number;

	@IsOptional()
	@Length(1, 60)
	@Field(() => String, { nullable: true })
	accessoryBrand?: string;

	@IsNotEmpty()
	@Field(() => [String])
	accessoryImages!: string[];

	@IsOptional()
	@Length(5, 500)
	@Field(() => String, { nullable: true })
	accessoryDesc?: string;

	/* At least one, and every member validated against PlantType: an accessory
	   nobody can match to a plant would never surface anywhere. */
	@ArrayNotEmpty()
	@IsEnum(PlantType, { each: true })
	@Field(() => [PlantType])
	compatiblePlantTypes!: PlantType[];

	@IsNotEmpty()
	@Field(() => PlantLocation)
	supplyLocation!: PlantLocation;

	@IsOptional()
	@Min(0)
	@Field(() => Number, { nullable: true })
	deliveryRadius?: number;

	// set server-side from the authenticated AGENT — never trusted from the client
	memberId?: ObjectId;
}

@InputType()
class AccISearch {
	@IsOptional()
	@Field(() => String, { nullable: true })
	memberId?: ObjectId;

	/** only accessories the agent marked as suitable for this kind of plant */
	@IsOptional()
	@IsEnum(PlantType)
	@Field(() => PlantType, { nullable: true })
	compatibleWith?: PlantType;

	@IsOptional()
	@Field(() => [AccessoryType], { nullable: true })
	typeList?: AccessoryType[];

	@IsOptional()
	@Field(() => [AccessoryCategory], { nullable: true })
	categoryList?: AccessoryCategory[];

	@IsOptional()
	@Field(() => [PlantLocation], { nullable: true })
	locationList?: PlantLocation[];

	@IsOptional()
	@Field(() => PricesRange, { nullable: true })
	pricesRange?: PricesRange;

	@IsOptional()
	@Field(() => PeriodsRange, { nullable: true })
	periodsRange?: PeriodsRange;

	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class AccessoriesInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableAccessorySorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => AccISearch)
	search!: AccISearch;
}

@InputType()
class AccAgentSearch {
	@IsOptional()
	@Field(() => AccessoryStatus, { nullable: true })
	accessoryStatus?: AccessoryStatus;
}

@InputType()
export class AgentAccessoriesInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableAccessorySorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => AccAgentSearch)
	search!: AccAgentSearch;
}

@InputType()
class AccAllSearch {
	@IsOptional()
	@Field(() => AccessoryStatus, { nullable: true })
	accessoryStatus?: AccessoryStatus;

	@IsOptional()
	@Field(() => [PlantLocation], { nullable: true })
	accessoryLocationList?: PlantLocation[];
}

@InputType()
export class AllAccessoriesInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableAccessorySorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => AccAllSearch)
	search!: AccAllSearch;
}
