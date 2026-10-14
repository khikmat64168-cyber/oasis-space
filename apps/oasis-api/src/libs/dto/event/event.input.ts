import { Field, InputType, Int } from '@nestjs/graphql';
import { IsIn, IsNotEmpty, IsOptional, Length, Matches, Max, Min } from 'class-validator';
import { EventStatus } from '../../enums/event.enum';
import { Direction } from '../../Errors';
import { availableEventSorts } from '../../config';

/**
 * Only a path imageUploader produced for the `event` target: the homepage
 * prefixes it with the API origin, so an outside URL or another folder would
 * either break the card or put somebody else's image on it.
 */
export const EVENT_IMAGE_PATH = /^uploads\/event\/[0-9a-f-]+\.[a-z0-9]+$/i;

@InputType()
export class EventInput {
	@IsNotEmpty()
	@Length(3, 100)
	@Field(() => String)
	eventTitle!: string;

	@IsNotEmpty()
	@Length(5, 500)
	@Field(() => String)
	eventDesc!: string;

	@IsNotEmpty()
	@Matches(EVENT_IMAGE_PATH)
	@Field(() => String)
	eventImage!: string;

	@IsNotEmpty()
	@Field(() => Date)
	eventDate!: Date;

	@IsNotEmpty()
	@Length(2, 120)
	@Field(() => String)
	eventLocation!: string;
}

/** Public read: upcoming events only. Nothing to sort or filter by. */
@InputType()
export class EventsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Max(50)
	@Field(() => Int)
	limit!: number;
}

@InputType()
class EventAllSearch {
	@IsOptional()
	@Field(() => EventStatus, { nullable: true })
	eventStatus?: EventStatus;
}

/** Admin read: every event, past and soft-deleted included. */
@InputType()
export class AllEventsInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page!: number;

	@IsNotEmpty()
	@Min(1)
	@Max(100)
	@Field(() => Int)
	limit!: number;

	@IsOptional()
	@IsIn(availableEventSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => EventAllSearch)
	search!: EventAllSearch;
}
