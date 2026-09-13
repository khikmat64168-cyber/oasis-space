import { Field, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { PlantLocation } from '../../enums/plant.enum';
import { Member, TotalCounter } from '../member/member';
import { OrderItem } from './order-item';

@ObjectType()
export class Order {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => String)
	customerId!: ObjectId;

	@Field(() => String)
	deliveryAddress!: string;

	@Field(() => PlantLocation, { nullable: true })
	deliveryCity?: PlantLocation;

	@Field(() => Number)
	orderTotal!: number;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;

	/** from aggregation **/

	@Field(() => [OrderItem], { nullable: true })
	items?: OrderItem[];

	@Field(() => Member, { nullable: true })
	customerData?: Member;
}

@ObjectType()
export class Orders {
	@Field(() => [Order])
	list!: Order[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
