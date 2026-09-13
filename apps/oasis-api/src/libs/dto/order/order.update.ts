import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty } from 'class-validator';
import type { ObjectId } from 'mongoose';
import { OrderStatus } from '../../enums/order.enum';

// Fulfilment happens per line item. This targets one OrderItem.
@InputType()
export class OrderItemStatusUpdate {
	@IsNotEmpty()
	@Field(() => String)
	itemId!: ObjectId;

	@IsNotEmpty()
	@Field(() => OrderStatus)
	orderStatus!: OrderStatus;
}
