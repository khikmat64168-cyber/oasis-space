import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { EventService } from './event.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enums';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Event, Events } from '../../libs/dto/event/event';
import { AllEventsInquiry, EventInput, EventsInquiry } from '../../libs/dto/event/event.input';
import { EventUpdate } from '../../libs/dto/event/event.update';
import { shapeIntoMongoObjectId } from '../../libs/config';

/**
 * Events are written by the ADMIN only. There is no admin screen for them
 * yet: they are created over GraphQL with the admin's token (see
 * ~/Desktop/oasis-demo/docs/events.md).
 */
@Resolver()
export class EventResolver {
	constructor(private readonly eventService: EventService) {}

	/** public: the homepage reads this signed in or not */
	@Query(() => Events)
	public async getEvents(@Args('input') input: EventsInquiry): Promise<Events> {
		console.log('Query: getEvents');
		return await this.eventService.getEvents(input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Event)
	public async createEvent(@Args('input') input: EventInput): Promise<Event> {
		console.log('Mutation: createEvent');
		return await this.eventService.createEvent(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Events)
	public async getAllEventsByAdmin(@Args('input') input: AllEventsInquiry): Promise<Events> {
		console.log('Query: getAllEventsByAdmin');
		return await this.eventService.getAllEventsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Event)
	public async updateEventByAdmin(@Args('input') input: EventUpdate): Promise<Event> {
		console.log('Mutation: updateEventByAdmin');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.eventService.updateEventByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Event)
	public async removeEventByAdmin(@Args('eventId') input: string): Promise<Event> {
		console.log('Mutation: removeEventByAdmin');
		const eventId = shapeIntoMongoObjectId(input);
		return await this.eventService.removeEventByAdmin(eventId);
	}
}
