import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { OrderItemType, OrderStatus } from '../../enums/order.enum';
import { PlantLocation } from '../../enums/plant.enum';
import { Member, TotalCounter } from '../member/member';
import { Plant } from '../plant/plant';
import { Accessory } from '../accessory/accessory';

@ObjectType()
export class OrderItem {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	orderId!: ObjectId;

	@Field(() => OrderItemType)
	itemType!: OrderItemType;

	@Field(() => String)
	refId!: ObjectId;

	@Field(() => String)
	customerId!: ObjectId;

	@Field(() => String)
	agentId!: ObjectId;

	@Field(() => Int)
	itemQuantity!: number;

	@Field(() => Number)
	unitPrice!: number;

	@Field(() => Number)
	itemTotal!: number;

	@Field(() => String)
	deliveryAddress!: string;

	@Field(() => PlantLocation, { nullable: true })
	deliveryCity?: PlantLocation;

	@Field(() => Date, { nullable: true })
	installationDate?: Date;

	@Field(() => OrderStatus)
	itemStatus!: OrderStatus;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** from aggregation — the matching product for this line **/

	@Field(() => Plant, { nullable: true })
	plantData?: Plant;

	@Field(() => Accessory, { nullable: true })
	accessoryData?: Accessory;

	@Field(() => Member, { nullable: true })
	agentData?: Member;
}

@ObjectType()
export class OrderItems {
	@Field(() => [OrderItem])
	list!: OrderItem[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
