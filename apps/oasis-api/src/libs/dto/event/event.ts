import { Field, ObjectType } from '@nestjs/graphql';
import type { ObjectId } from 'mongoose';
import { EventStatus } from '../../enums/event.enum';
import { TotalCounter } from '../member/member';

@ObjectType()
export class Event {
	@Field(() => String)
	_id!: ObjectId;

	@Field(() => EventStatus)
	eventStatus!: EventStatus;

	@Field(() => String)
	eventTitle!: string;

	@Field(() => String)
	eventDesc!: string;

	@Field(() => String)
	eventImage!: string;

	@Field(() => Date)
	eventDate!: Date;

	@Field(() => String)
	eventLocation!: string;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt!: Date;

	@Field(() => Date)
	updatedAt!: Date;
}

@ObjectType()
export class Events {
	@Field(() => [Event])
	list!: Event[];

	@Field(() => [TotalCounter], { nullable: true })
	metaCounter!: TotalCounter[];
}
