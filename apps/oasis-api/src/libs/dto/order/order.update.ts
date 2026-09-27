import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, Length } from 'class-validator';
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

	/** optional carrier reference, typically recorded alongside IN_TRANSIT */
	@IsOptional()
	@Length(1, 100)
	@Field(() => String, { nullable: true })
	trackingNumber?: string;
}
