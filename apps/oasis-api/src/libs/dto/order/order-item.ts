import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { OrderItemType, OrderStatus } from '../../enums/order.enum';
import { PlantLocation } from '../../enums/plant.enum';
import { Member, TotalCounter } from '../member/member';
import { Plant } from '../plant/plant';
import { Accessory } from '../accessory/accessory';

@ObjectType()
export class OrderItemEvent {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	orderItemId!: ObjectId;

	@Field(() => OrderStatus)
	status!: OrderStatus;

	/** null for the system-written PENDING entry */
	@Field(() => String, { nullable: true })
	changedBy?: ObjectId;

	@Field(() => Date)
	createdAt!: Date;
}

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

	/** carrier reference recorded by the agent when the line ships */
	@Field(() => String, { nullable: true })
	trackingNumber?: string;

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

	/** append-only fulfilment timeline, oldest first */
	@Field(() => [OrderItemEvent], { nullable: true })
	history?: OrderItemEvent[];
}

@ObjectType()
export class OrderItems {
	@Field(() => [OrderItem])
	list!: OrderItem[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
