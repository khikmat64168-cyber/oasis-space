import { registerEnumType } from '@nestjs/graphql';

/**
 * Order lifecycle:
 *   PENDING → CONFIRMED → IN_TRANSIT → INSTALLED
 * CANCELLED is reachable from PENDING / CONFIRMED / IN_TRANSIT.
 * INSTALLED and CANCELLED are terminal. Legal transitions + role rules are
 * enforced in OrderService (never trust the client to set an arbitrary status).
 */
export enum OrderStatus {
	PENDING = 'PENDING',
	CONFIRMED = 'CONFIRMED',
	IN_TRANSIT = 'IN_TRANSIT',
	INSTALLED = 'INSTALLED',
	CANCELLED = 'CANCELLED',
}
registerEnumType(OrderStatus, { name: 'OrderStatus' });

/** What kind of product an order line item points at. */
export enum OrderItemType {
	PLANT = 'PLANT',
	ACCESSORY = 'ACCESSORY',
}
registerEnumType(OrderItemType, { name: 'OrderItemType' });
