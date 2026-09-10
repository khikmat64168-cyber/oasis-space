import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsInt, IsNotEmpty, IsOptional, Length, Min } from 'class-validator';
import { Direction } from '../../Errors';
import { PlantCategory, PlantLocation, PlantStatus, PlantType } from '../../enums/plant.enum';
import type { ObjectId } from 'mongoose';
import { availablePlantSorts } from '../../config';

@InputType()
export class PlantInput {
	@IsNotEmpty()
	@Field(() => PlantType)
	plantType!: PlantType;

	@IsNotEmpty()
	@Field(() => PlantCategory)
	plantCategory!: PlantCategory;

	@IsNotEmpty()
	@Field(() => PlantLocation)
	supplyLocation!: PlantLocation;

	@IsNotEmpty()
	@Length(3, 100)
	@Field(() => String)
	plantAddress!: string;

	@IsNotEmpty()
	@Length(3, 100)
	@Field(() => String)
	plantTitle!: string;

	@IsNotEmpty()
	@Field(() => Number)
	plantPrice!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Number)
	plantHeight!: number;

	@IsOptional()
	@Min(1)
	@Field(() => Number, { nullable: true })
	potSize?: number;

	@IsOptional()
	@Min(0)
	@Field(() => Number, { nullable: true })
	deliveryRadius?: number;

	@IsNotEmpty()
	@Field(() => [String])
	plantImages!: string[];

	@IsOptional()
	@Length(5, 500)
	@Field(() => String, { nullable: true })
	plantDesc?: string;

	// set server-side from the authenticated AGENT — never trusted from the client
	memberId?: ObjectId;
}

@InputType()
export class PricesRange {
	@Field(() => Int)
	start!: number;

	@Field(() => Int)
	end!: number;
}

@InputType()
export class HeightsRange {
	@Field(() => Int)
	start!: number;

	@Field(() => Int)
	end!: number;
}

@InputType()
export class PeriodsRange {
	@Field(() => Date)
	start!: Date;

	@Field(() => Date)
	end!: Date;
}

@InputType()
class PISearch {
	@IsOptional()
	@Field(() => String, { nullable: true })
	memberId?: ObjectId;

	@IsOptional()
	@Field(() => [PlantLocation], { nullable: true })
	locationList?: PlantLocation[];

	@IsOptional()
	@Field(() => [PlantType], { nullable: true })
	typeList?: PlantType[];

	@IsOptional()
	@Field(() => [PlantCategory], { nullable: true })
	categoryList?: PlantCategory[];

	@IsOptional()
	@Field(() => PricesRange, { nullable: true })
	pricesRange?: PricesRange;

	@IsOptional()
	@Field(() => HeightsRange, { nullable: true })
	heightsRange?: HeightsRange;

	@IsOptional()
	@Field(() => PeriodsRange, { nullable: true })
	periodsRange?: PeriodsRange;

	@IsOptional()
	@Field(() => String, { nullable: true })
	text?: string;
}

@InputType()
export class PlantsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availablePlantSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => PISearch)
	search!: PISearch;
}

@InputType()
class APISearch {
	@IsOptional()
	@Field(() => PlantStatus, { nullable: true })
	plantStatus?: PlantStatus;
}

@InputType()
export class AgentPlantsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availablePlantSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => APISearch)
	search!: APISearch;
}

@InputType()
class ALPISearch {
	@IsOptional()
	@Field(() => PlantStatus, { nullable: true })
	plantStatus?: PlantStatus;

	@IsOptional()
	@Field(() => [PlantLocation], { nullable: true })
	plantLocationList?: PlantLocation[];
}

@InputType()
export class AllPlantsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availablePlantSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => ALPISearch)
	search!: ALPISearch;
}

@InputType()
export class OrdinaryInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;
}
