import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ObjectId } from 'mongoose';
import { PlantService } from '../plant/plant.service';
import { MemberService } from '../member/member.service';
import { BoardArticleService } from '../board-article/board-article.service';
import { OrderService } from '../order/order.service';
import { Plant } from '../../libs/dto/plant/plant';
import { Member } from '../../libs/dto/member/member';
import { BoardArticle } from '../../libs/dto/member/board-article/board-article';
import { Order } from '../../libs/dto/order/order';
import { PlantCategory, PlantLocation, PlantType } from '../../libs/enums/plant.enum';
import { BoardArticleStatus } from '../../libs/enums/board-article.enum';
import { MemberType } from '../../libs/enums/member.enums';
import { Direction } from '../../libs/Errors';
import { shapeIntoMongoObjectId } from '../../libs/config';

/**
 * The only doors the assistant has into Oasis data.
 *
 * Every one of these is READ-ONLY and goes through the service the rest of
 * the API already uses, so the existing guards, status filters and ownership
 * rules apply unchanged — the assistant cannot see a soft-deleted plant, an
 * unpublished article or somebody else's order, because those services never
 * return them.
 *
 * Three rules hold throughout:
 *   - arguments are validated here, not trusted from a caller or a model;
 *   - results are capped, so no question can pull the catalogue;
 *   - an id that does not resolve is an error, never an invented record.
 */

/** nothing a question can say should make these bigger */
const MAX_PLANTS = 6;
const MAX_AGENTS = 4;
const MAX_ARTICLES = 3;
const MAX_ORDERS = 5;

export interface PlantSearchFilters {
	text?: string;
	location?: PlantLocation;
	type?: PlantType;
	category?: PlantCategory;
	maxPrice?: number;
	minPrice?: number;
	limit?: number;
	/** the question asked for the cheap end of the catalogue */
	cheapestFirst?: boolean;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Drop a trailing plural from a one-word name search.
 *
 * The service matches plantName with a substring regex, so "maples" finds
 * nothing while the catalogue holds "Japanese Maple". Searching the singular
 * finds both, which is why this trims rather than expands.
 */
const singularise = (text: string): string => {
	const words = text.split(/\s+/);
	if (words.length !== 1) return text;
	const w = words[0];
	if (w.length > 4 && /(?<![su])s$/i.test(w)) return w.slice(0, -1);
	return w;
};

/** A model may propose an id; it never gets used before passing this. */
export const assertObjectId = (value: string | undefined | null, label: string): ObjectId => {
	if (!value || !OBJECT_ID.test(String(value))) throw new BadRequestException(`INVALID_${label}`);
	return shapeIntoMongoObjectId(String(value));
};

@Injectable()
export class AssistantTools {
	private readonly logger = new Logger(AssistantTools.name);

	constructor(
		private readonly plantService: PlantService,
		private readonly memberService: MemberService,
		private readonly boardArticleService: BoardArticleService,
		private readonly orderService: OrderService,
	) {}

	/**
	 * Live catalogue search. Price and stock come back as the database holds
	 * them right now — this is the tool a "how much is it" question must use,
	 * never a remembered passage.
	 */
	public async searchPlants(filters: PlantSearchFilters, viewerId: ObjectId | null): Promise<Plant[]> {
		const limit = Math.min(Math.max(filters.limit ?? 3, 1), MAX_PLANTS);

		const search: Record<string, unknown> = {};
		/*
		 * `text` regex-matches plantName, so it only helps when what is left of
		 * the question could BE a name — and only when nothing structured was
		 * understood. "cheapest in Seoul" leaves the word "cheapest", which as
		 * a name search matches nothing and would silently empty a perfectly
		 * good search by city. When a filter is present, the filter IS the
		 * query and the leftovers are noise.
		 */
		const structured = !!(filters.location || filters.type || filters.category || filters.maxPrice || filters.minPrice);
		const remainder = (filters.text ?? '').trim();
		const looksLikeAName = remainder.length > 2 && remainder.split(/\s+/).length <= 3;
		if (!structured && looksLikeAName) search.text = singularise(remainder).slice(0, 60);
		if (filters.location) search.locationList = [filters.location];
		if (filters.type) search.typeList = [filters.type];
		if (filters.category) search.categoryList = [filters.category];
		if (filters.maxPrice || filters.minPrice) {
			search.pricesRange = { start: filters.minPrice ?? 0, end: filters.maxPrice ?? 1_000_000_000 };
		}

		try {
			const res = await this.plantService.getPlants(viewerId as ObjectId, {
				page: 1,
				limit,
				// a price question wants the cheap end, not the popular end
				sort: filters.cheapestFirst ? 'plantPrice' : 'plantRank',
				direction: filters.cheapestFirst ? Direction.ASC : Direction.DESC,
				search,
			} as never);
			return res?.list ?? [];
		} catch (err) {
			// an empty catalogue answer is a legitimate outcome; a thrown
			// aggregation is not something the visitor can act on
			this.logger.warn(`searchPlants failed: ${err instanceof Error ? err.message : 'unknown'}`);
			return [];
		}
	}

	/** One plant, by an id that must resolve. Throws rather than inventing. */
	public async getPlant(plantId: string, viewerId: ObjectId | null): Promise<Plant> {
		const id = assertObjectId(plantId, 'PLANT_ID');
		// getPlant already refuses anything that is not ACTIVE
		return await this.plantService.getPlant(viewerId as ObjectId, id);
	}

	public async searchAgents(text: string | undefined, viewerId: ObjectId | null): Promise<Member[]> {
		const remainder = (text ?? '').trim();
		const nameLike = remainder.length > 2 && remainder.split(/\s+/).length <= 2;
		try {
			const res = await this.memberService.getAgents(viewerId as ObjectId, {
				page: 1,
				limit: MAX_AGENTS,
				// whitelisted sort — anything else is rejected by the DTO
				sort: 'memberRank',
				direction: Direction.DESC,
				/* same rule as the catalogue: a name search only when what is left
				   could be a name. Anything longer is leftover question words,
				   and matching them against memberNick returns nobody. */
				search: nameLike ? { text: (text as string).trim().slice(0, 40) } : {},
			} as never);
			return res?.list ?? [];
		} catch (err) {
			this.logger.warn(`searchAgents failed: ${err instanceof Error ? err.message : 'unknown'}`);
			return [];
		}
	}

	/**
	 * A grower's public profile. Only AGENT accounts are addressable this way;
	 * a client's member record is not a public profile and must not become one
	 * through the assistant.
	 */
	public async getAgent(agentId: string, viewerId: ObjectId | null): Promise<Member> {
		const id = assertObjectId(agentId, 'AGENT_ID');
		const member = await this.memberService.getMember(viewerId, id);
		if (member?.memberType !== MemberType.AGENT) throw new BadRequestException('NOT_AN_AGENT');
		return member;
	}

	/** Published articles only — getBoardArticles filters on ACTIVE itself. */
	public async searchArticles(text: string | undefined, viewerId: ObjectId | null): Promise<BoardArticle[]> {
		try {
			const res = await this.boardArticleService.getBoardArticles(viewerId as ObjectId, {
				page: 1,
				limit: MAX_ARTICLES,
				sort: 'articleViews',
				direction: Direction.DESC,
				search: {
					articleStatus: BoardArticleStatus.ACTIVE,
					...(text && text.trim().length > 1 ? { text: text.trim().slice(0, 60) } : {}),
				},
			} as never);
			return res?.list ?? [];
		} catch (err) {
			this.logger.warn(`searchArticles failed: ${err instanceof Error ? err.message : 'unknown'}`);
			return [];
		}
	}

	/**
	 * The caller's own orders, and only ever those.
	 *
	 * `customerId` is the id the resolver read out of the verified token. It is
	 * never taken from the question, from page context, or from anything a
	 * model produced — getMyOrders matches on it, so there is no argument that
	 * could widen the result to another person's orders.
	 */
	public async getMyOrders(customerId: ObjectId): Promise<Order[]> {
		if (!customerId) throw new BadRequestException('NOT_AUTHENTICATED');
		try {
			const res = await this.orderService.getMyOrders(customerId, {
				page: 1,
				limit: MAX_ORDERS,
			} as never);
			return res?.list ?? [];
		} catch (err) {
			this.logger.warn(`getMyOrders failed: ${err instanceof Error ? err.message : 'unknown'}`);
			return [];
		}
	}
}
