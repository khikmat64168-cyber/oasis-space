import { registerEnumType } from '@nestjs/graphql';

/**
 * eventStatus — ACTIVE events can appear on the homepage; DELETE is the soft
 * delete an admin sets first, and only a DELETE event can be removed for good
 * (the same two-step rule accessories follow).
 */
export enum EventStatus {
	ACTIVE = 'ACTIVE',
	DELETE = 'DELETE',
}
registerEnumType(EventStatus, { name: 'EventStatus' });
