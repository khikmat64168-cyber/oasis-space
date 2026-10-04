import { Field, Int, ObjectType } from '@nestjs/graphql';

/**
 * Public, aggregate-only platform counters for the marketing hero.
 *
 * Deliberately three scalars and nothing else. Every underlying order
 * operation is role-guarded (a client sees only their own orders, an agent
 * only their own lines), so this is the one place where order data is read
 * without a token — which is safe precisely because no document, member or
 * identifier ever leaves the aggregation, only totals.
 */
@ObjectType()
export class PlatformStats {
	/**
	 * Units of plants actually delivered: sum of itemQuantity over PLANT lines
	 * that reached INSTALLED. INSTALLED is the terminal success state of
	 * PENDING → CONFIRMED → IN_TRANSIT → INSTALLED, so in-flight and cancelled
	 * lines are both excluded. Accessories are not plants and are not counted.
	 */
	@Field(() => Int)
	plantsSold!: number;

	/** Distinct customers who have at least one INSTALLED line. */
	@Field(() => Int)
	clientsServed!: number;

	/** Members with memberType AGENT and memberStatus ACTIVE. */
	@Field(() => Int)
	activeAgents!: number;

	/**
	 * Distinct supplyLocation values across ACTIVE plants — the cities agents
	 * actually supply from, i.e. where there is a shop to buy from today.
	 * Read off the plants rather than off Member.memberAddress, which is free
	 * text and cannot be counted as a city.
	 */
	@Field(() => Int)
	locations!: number;
}
