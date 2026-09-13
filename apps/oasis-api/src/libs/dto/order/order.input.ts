import { Field, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, Length, Min, ArrayMinSize } from 'class-validator';
import type { ObjectId } from 'mongoose';
import { OrderItemType, OrderStatus } from '../../enums/order.enum';
import { PlantLocation } from '../../enums/plant.enum';
import { Direction } from '../../Errors';
import { availableOrderSorts } from '../../config';

@InputType()
export class OrderItemInput {
	@IsNotEmpty()
	@Field(() => OrderItemType)
	itemType!: OrderItemType;

	@IsNotEmpty()
	@Field(() => String)
	refId!: ObjectId;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Field(() => Int, { nullable: true })
	itemQuantity?: number;

	@IsOptional()
	@Field(() => Date, { nullable: true })
	installationDate?: Date;
}

@InputType()
export class OrderInput {
	@IsNotEmpty()
	@Length(5, 200)
	@Field(() => String)
	deliveryAddress!: string;

	@IsOptional()
	@Field(() => PlantLocation, { nullable: true })
	deliveryCity?: PlantLocation;

	@IsArray()
	@ArrayMinSize(1)
	@Field(() => [OrderItemInput])
	items!: OrderItemInput[];
}

@InputType()
export class OrdersInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableOrderSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;
}

@InputType()
class AgentItemSearch {
	@IsOptional()
	@Field(() => OrderStatus, { nullable: true })
	itemStatus?: OrderStatus;
}

@InputType()
export class AgentItemsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableOrderSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsOptional()
	@Field(() => AgentItemSearch, { nullable: true })
	search?: AgentItemSearch;
}
