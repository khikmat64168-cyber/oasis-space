import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PlatformStats } from '../../libs/dto/analytics/analytics';
import { OrderItem } from '../../libs/dto/order/order-item';
import { Member } from '../../libs/dto/member/member';
import { Plant } from '../../libs/dto/plant/plant';
import { OrderItemType, OrderStatus } from '../../libs/enums/order.enum';
import { MemberStatus, MemberType } from '../../libs/enums/member.enums';
import { PlantStatus } from '../../libs/enums/plant.enum';

@Injectable()
export class AnalyticsService {
	constructor(
		@InjectModel('OrderItem') private readonly orderItemModel: Model<OrderItem>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		@InjectModel('Plant') private readonly plantModel: Model<Plant>,
	) {}

	/**
	 * The two order-derived counters come from ONE pass over the delivered
	 * lines via $facet, rather than two round trips, because both read the same
	 * matched set and the match is the expensive half.
	 *
	 * clientsServed counts DISTINCT customers, not lines: a client who had
	 * three plants installed has been served once. That is why it groups by
	 * customerId first and counts the groups, instead of summing.
	 */
	public async getPlatformStats(): Promise<PlatformStats> {
		const [facet] = await this.orderItemModel
			.aggregate([
				{ $match: { itemStatus: OrderStatus.INSTALLED } },
				{
					$facet: {
						plants: [
							{ $match: { itemType: OrderItemType.PLANT } },
							{ $group: { _id: null, units: { $sum: '$itemQuantity' } } },
						],
						clients: [{ $group: { _id: '$customerId' } }, { $count: 'total' }],
					},
				},
			])
			.exec();

		// independent of the orders above, so both reads go out together
		const [activeAgents, cities] = await Promise.all([
			this.memberModel
				.countDocuments({ memberType: MemberType.AGENT, memberStatus: MemberStatus.ACTIVE })
				.exec(),
			// distinct, not count: six plants in Busan are one location
			this.plantModel.distinct('supplyLocation', { plantStatus: PlantStatus.ACTIVE }).exec(),
		]);

		return {
			plantsSold: facet?.plants?.[0]?.units ?? 0,
			clientsServed: facet?.clients?.[0]?.total ?? 0,
			activeAgents,
			locations: cities.length,
		};
	}
}
