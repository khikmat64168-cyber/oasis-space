import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, Length, Matches } from 'class-validator';
import type { ObjectId } from 'mongoose';
import { EventStatus } from '../../enums/event.enum';
import { EVENT_IMAGE_PATH } from './event.input';

@InputType()
export class EventUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id!: ObjectId;

	@IsOptional()
	@Field(() => EventStatus, { nullable: true })
	eventStatus?: EventStatus;

	@IsOptional()
	@Length(3, 100)
	@Field(() => String, { nullable: true })
	eventTitle?: string;

	@IsOptional()
	@Length(5, 500)
	@Field(() => String, { nullable: true })
	eventDesc?: string;

	@IsOptional()
	@Matches(EVENT_IMAGE_PATH)
	@Field(() => String, { nullable: true })
	eventImage?: string;

	@IsOptional()
	@Field(() => Date, { nullable: true })
	eventDate?: Date;

	@IsOptional()
	@Length(2, 120)
	@Field(() => String, { nullable: true })
	eventLocation?: string;

	deletedAt?: Date;
}
