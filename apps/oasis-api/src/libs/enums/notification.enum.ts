import { registerEnumType } from '@nestjs/graphql';

/**
 * What happened. Each type is written by the order flow at the moment the
 * underlying state changes, so a notification is always a record of something
 * that really occurred — never a reminder generated on read.
 *
 * Scope is deliberately order-only. Payment, invoice, messaging and inventory
 * types are NOT listed here because the backend has no such events to fire them
 * from; see docs/notifications-phase1-audit.md in the client repo.
 */
export enum NotificationType {
	// ---- to the CLIENT who placed the order ----
	/** the order was accepted and written */
	ORDER_CREATED = 'ORDER_CREATED',
	/** an agent accepted a line: PENDING → CONFIRMED */
	ORDER_CONFIRMED = 'ORDER_CONFIRMED',
	/** an agent cancelled a line that was still PENDING, i.e. turned the order down */
	ORDER_REJECTED = 'ORDER_REJECTED',
	/** CONFIRMED → IN_TRANSIT */
	ORDER_IN_TRANSIT = 'ORDER_IN_TRANSIT',
	/** IN_TRANSIT → INSTALLED, the terminal success state */
	ORDER_INSTALLED = 'ORDER_INSTALLED',

	// ---- to whichever side did not press cancel ----
	/** a line was cancelled by the agent or an admin */
	ORDER_CANCELLED = 'ORDER_CANCELLED',
	/** the customer cancelled — sent to the supplying agent */
	ORDER_CANCELLED_BY_CLIENT = 'ORDER_CANCELLED_BY_CLIENT',

	// ---- to the AGENT ----
	/** a client ordered from this agent */
	NEW_ORDER = 'NEW_ORDER',
	/** an ADMIN moved one of this agent's lines; the agent did not do it themselves */
	ORDER_DELIVERY_UPDATE = 'ORDER_DELIVERY_UPDATE',

	// ---- retired, never written again ----
	// Kept so the rows already in the `notifications` collection still resolve
	// through GraphQL. Removing them would break serialization of every
	// notification written before the types above existed.
	/** @deprecated superseded by NEW_ORDER */
	ORDER_PLACED = 'ORDER_PLACED',
	/** @deprecated split into ORDER_CONFIRMED / ORDER_IN_TRANSIT / ORDER_INSTALLED */
	ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
}
registerEnumType(NotificationType, { name: 'NotificationType' });

export enum NotificationStatus {
	WAIT = 'WAIT',
	READ = 'READ',
}
registerEnumType(NotificationStatus, { name: 'NotificationStatus' });
