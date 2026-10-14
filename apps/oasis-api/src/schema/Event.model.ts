import { Schema } from 'mongoose';
import { EventStatus } from '../libs/enums/event.enum';

/**
 * A real-world gathering Oasis Space announces on the homepage — a market, an
 * open nursery day, a workshop. Written by the ADMIN only.
 *
 * `createdAt` is kept by `timestamps` like every other collection, but it is
 * not what the homepage shows: a visitor needs when and where the event takes
 * place, not when it was typed in.
 */
const EventSchema = new Schema(
	{
		eventStatus: {
			type: String,
			enum: EventStatus,
			default: EventStatus.ACTIVE,
		},

		eventTitle: {
			type: String,
			required: true,
		},

		eventDesc: {
			type: String,
			required: true,
		},

		// an `uploads/event/…` path from imageUploader, served from /uploads
		eventImage: {
			type: String,
			required: true,
		},

		// when it takes place; past events drop off the homepage on their own
		eventDate: {
			type: Date,
			required: true,
		},

		// free text: a venue is not one of the PlantLocation cities
		eventLocation: {
			type: String,
			required: true,
		},

		deletedAt: {
			type: Date,
		},
	},
	{ timestamps: true, collection: 'events' },
);

EventSchema.index({ eventStatus: 1, eventDate: 1 });

export default EventSchema;
