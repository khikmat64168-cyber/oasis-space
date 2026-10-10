import { OrderStatus } from '../../libs/enums/order.enum';

const FLOW: OrderStatus[] = [
	OrderStatus.PENDING,
	OrderStatus.CONFIRMED,
	OrderStatus.IN_TRANSIT,
	OrderStatus.INSTALLED,
];

const LABEL: Record<OrderStatus, string> = {
	[OrderStatus.PENDING]: 'pending',
	[OrderStatus.CONFIRMED]: 'confirmed',
	[OrderStatus.IN_TRANSIT]: 'in transit',
	[OrderStatus.INSTALLED]: 'installed',
	[OrderStatus.CANCELLED]: 'cancelled',
};

/**
 * One word for a whole order, derived the same way the Orders page derives it:
 * the least-advanced line that is still live. There is no status column on
 * Order, so this must never be presented as a stored field.
 */
export const STATUS_ORDER_LABEL = (items: { itemStatus: OrderStatus }[]): string => {
	const active = items.filter((i) => i.itemStatus !== OrderStatus.CANCELLED);
	if (!active.length) return LABEL[OrderStatus.CANCELLED];
	let min: OrderStatus = OrderStatus.INSTALLED;
	for (const item of active) {
		if (FLOW.indexOf(item.itemStatus) < FLOW.indexOf(min)) min = item.itemStatus;
	}
	return LABEL[min];
};
