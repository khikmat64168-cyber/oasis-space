import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import moment from 'moment';
import { Event, Events } from '../../libs/dto/event/event';
import { AllEventsInquiry, EventInput, EventsInquiry } from '../../libs/dto/event/event.input';
import { EventUpdate } from '../../libs/dto/event/event.update';
import { Direction, Message } from '../../libs/Errors';
import { EventStatus } from '../../libs/enums/event.enum';
import { T } from '../../libs/types/common';

@Injectable()
export class EventService {
	constructor(@InjectModel('Event') private readonly eventModel: Model<Event>) {}

	public async createEvent(input: EventInput): Promise<Event> {
		try {
			return await this.eventModel.create(input);
		} catch (err) {
			console.log('Error, Service.model:', err);
			throw new BadRequestException(Message.CREATE_FAILED);
		}
	}

	/**
	 * What the homepage shows: ACTIVE events that have not happened yet,
	 * soonest first.
	 *
	 * "Not yet" is measured from the start of today, so an event later today
	 * is still on the homepage during the morning of it.
	 */
	public async getEvents(input: EventsInquiry): Promise<Events> {
		const match: T = {
			eventStatus: EventStatus.ACTIVE,
			eventDate: { $gte: moment().startOf('day').toDate() },
		};

		const result = await this.eventModel
			.aggregate([
				{ $match: match },
				{ $sort: { eventDate: Direction.ASC } },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return result[0];
	}

	public async getAllEventsByAdmin(input: AllEventsInquiry): Promise<Events> {
		const { eventStatus } = input.search;
		const match: T = {};
		const sort: T = { [input?.sort ?? 'eventDate']: input?.direction ?? Direction.DESC };

		if (eventStatus) match.eventStatus = eventStatus;

		const result = await this.eventModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [{ $skip: (input.page - 1) * input.limit }, { $limit: input.limit }],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
		return result[0];
	}

	public async updateEventByAdmin(input: EventUpdate): Promise<Event> {
		const search: T = { _id: input._id, eventStatus: EventStatus.ACTIVE };
		if (input.eventStatus === EventStatus.DELETE) input.deletedAt = moment().toDate();

		const result = await this.eventModel.findOneAndUpdate(search, input, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);
		return result;
	}

	/** Only an event already set to DELETE can be removed for good. */
	public async removeEventByAdmin(eventId: ObjectId): Promise<Event> {
		const search: T = { _id: eventId, eventStatus: EventStatus.DELETE };
		const result = await this.eventModel.findOneAndDelete(search).exec();
		if (!result) throw new InternalServerErrorException(Message.REMOVE_FAILED);
		return result;
	}
}
