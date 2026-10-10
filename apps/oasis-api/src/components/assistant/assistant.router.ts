import { AssistantIntent } from '../../libs/enums/assistant.enum';
import { PlantCategory, PlantLocation, PlantType } from '../../libs/enums/plant.enum';

/**
 * Intent routing, done in code rather than by the model.
 *
 * Two reasons it is not a model call. It decides which DATABASE QUERY runs, so
 * a hallucinated route is a wrong query rather than a clumsy sentence; and
 * most questions never need a generation call at all, which is the difference
 * between a feature that costs nothing to run and one that bills per hello.
 *
 * The router is intentionally conservative: anything it cannot place lands on
 * UNKNOWN_OR_UNSUPPORTED, where the service asks for a clarification instead
 * of guessing at a tool.
 */

export interface RoutedQuestion {
	intent: AssistantIntent;
	/**
	 * True when no keyword matched and the catalogue was tried on the chance
	 * the question names a plant. A miss here means "this was probably not an
	 * Oasis question", not "the catalogue is empty".
	 */
	guessed?: boolean;
	/** free text left after the routing words were consumed */
	terms: string;
	filters: {
		location?: PlantLocation;
		type?: PlantType;
		category?: PlantCategory;
		maxPrice?: number;
		minPrice?: number;
		cheapestFirst?: boolean;
	};
}

/** "jeju island" and "jeju" both have to reach PlantLocation.JEJU */
const LOCATION_WORDS: Record<string, PlantLocation> = Object.values(PlantLocation).reduce((acc, loc) => {
	acc[loc.toLowerCase().replace(/_/g, ' ')] = loc;
	acc[loc.toLowerCase().replace(/_/g, '')] = loc;
	// the leading word on its own: "JEJU_ISLAND" -> "jeju"
	acc[loc.toLowerCase().split('_')[0]] = loc;
	return acc;
}, {} as Record<string, PlantLocation>);

const TYPE_WORDS: Record<string, PlantType> = Object.values(PlantType).reduce((acc, t) => {
	acc[t.toLowerCase().replace(/_/g, ' ')] = t;
	return acc;
}, {} as Record<string, PlantType>);

const CATEGORY_WORDS: Record<string, PlantCategory> = Object.values(PlantCategory).reduce((acc, c) => {
	acc[c.toLowerCase().replace(/_/g, ' ')] = c;
	return acc;
}, {} as Record<string, PlantCategory>);

/**
 * Substring matching was wrong for short words: "maples" contains "map", so
 * "do you have any maples?" routed to the map. Single words are matched on a
 * word boundary; multi-word phrases stay a substring test, which is what they
 * need ("how much", "where is my").
 */
const has = (text: string, words: string[]): boolean =>
	words.some((w) =>
		w.includes(' ')
			? text.includes(w)
			: // an optional plural, so "growers" still matches "grower" while
			  // "maples" does not match "map"
			  new RegExp(`\\b${w}(?:s|es)?\\b`).test(text),
	);

/** cheap, inclusive signals — the router errs towards asking rather than acting */
const ORDER_WORDS = ['my order', 'my orders', 'order status', 'where is my', 'my delivery', 'my purchase'];
const CARE_WORDS = ['care', 'water', 'watering', 'sunlight', 'light', 'humidity', 'temperature', 'prune', 'repot', 'soil', 'fertilis', 'fertiliz', 'look after', 'keep alive'];
const CS_WORDS = ['delivery policy', 'refund', 'cancel', 'return policy', 'shipping', 'payment', 'how do i order', 'how long', 'contact', 'support', 'install'];
const AGENT_WORDS = ['agent', 'grower', 'supplier', 'nursery', 'seller'];
const ARTICLE_WORDS = ['article', 'community', 'post', 'board', 'blog', 'news'];
const MAP_WORDS = ['map', 'near me', 'nearby', 'which city', 'where can i find', 'closest'];
const SEARCH_WORDS = ['find', 'show me', 'looking for', 'recommend', 'suggest', 'cheap', 'inexpensive', 'affordable', 'under', 'buy'];
const ABOUT_WORDS = ['what is oasis', 'about oasis', 'who are you', 'what do you do', 'how does oasis'];

/** a greeting is not a question; answering it with a capability list reads as a failure */
const GREETING_RE = /^(hi|hey|hello|yo|salom|annyeong|안녕|привет|thanks?|thank you|thx|ok|okay|bye|good (morning|afternoon|evening))\b[\s!.?]*$/i;

/** words that say the subject is the catalogue, even with no filter attached */
const PLANT_TOPIC_WORDS = ['plant', 'plants', 'flower', 'flowers', 'tree', 'trees', 'catalogue', 'catalog', 'stock', 'price', 'cost', 'how much', 'available', 'sell', 'selling'];

/** "under 50000", "under ₩50,000", "less than 50000 won" */
const priceCeiling = (text: string): number | undefined => {
	const m = text.match(/(?:under|below|less than|cheaper than|max(?:imum)?)\s*₩?\s*([\d,]+)/);
	if (!m) return undefined;
	const value = Number(m[1].replace(/,/g, ''));
	return Number.isFinite(value) && value > 0 ? value : undefined;
};

export const routeQuestion = (rawQuestion: string, page?: string): RoutedQuestion => {
	const q = String(rawQuestion ?? '').toLowerCase().trim();
	const filters: RoutedQuestion['filters'] = {};

	for (const [word, loc] of Object.entries(LOCATION_WORDS)) {
		// word boundary, so "seoul" does not match inside another token
		if (word.length > 2 && new RegExp(`\\b${word}\\b`).test(q)) {
			filters.location = loc;
			break;
		}
	}
	for (const [word, t] of Object.entries(TYPE_WORDS)) {
		if (q.includes(word)) {
			filters.type = t;
			break;
		}
	}
	for (const [word, c] of Object.entries(CATEGORY_WORDS)) {
		if (q.includes(word)) {
			filters.category = c;
			break;
		}
	}
	const ceiling = priceCeiling(q);
	if (ceiling) filters.maxPrice = ceiling;
	if (/\b(cheap|cheapest|inexpensive|affordable|budget|lowest price)/.test(q)) filters.cheapestFirst = true;

	const pick = (): AssistantIntent => {
		if (GREETING_RE.test(q)) return AssistantIntent.GREETING;

		// private data first: it is the one branch with an authorisation gate,
		// so it must not be shadowed by a looser match below
		if (has(q, ORDER_WORDS)) return AssistantIntent.ORDER_INFORMATION;

		if (has(q, ABOUT_WORDS)) return AssistantIntent.GENERAL_OASIS_INFORMATION;
		if (has(q, CS_WORDS)) return AssistantIntent.CUSTOMER_SERVICE;
		if (has(q, ARTICLE_WORDS)) return AssistantIntent.COMMUNITY_ARTICLE;

		if (has(q, CARE_WORDS)) return AssistantIntent.PLANT_CARE;

		if (has(q, AGENT_WORDS)) {
			// on an agent's own page, a bare "tell me about them" is the profile
			return page === 'agent' ? AssistantIntent.AGENT_PROFILE : AssistantIntent.AGENT_SEARCH;
		}

		if (has(q, MAP_WORDS) || (page === 'map' && (filters.location || filters.type))) {
			return AssistantIntent.MAP_LOCATION;
		}

		if (
			filters.location ||
			filters.type ||
			filters.category ||
			filters.maxPrice ||
			has(q, SEARCH_WORDS) ||
			has(q, PLANT_TOPIC_WORDS)
		) {
			return AssistantIntent.PLANT_SEARCH;
		}

		// on a plant's page an unqualified question is about that plant
		if (page === 'plant') return AssistantIntent.PLANT_DETAILS;
		if (page === 'article') return AssistantIntent.COMMUNITY_ARTICLE;
		if (page === 'agent') return AssistantIntent.AGENT_PROFILE;
		if (page === 'cs') return AssistantIntent.CUSTOMER_SERVICE;

		return AssistantIntent.UNKNOWN_OR_UNSUPPORTED;
	};

	/*
	 * What is left after the routing words are consumed.
	 *
	 * The words that BECAME a filter are removed too. Leaving them in meant a
	 * question like "an inexpensive tree in Seoul" sent "tree seoul" to a
	 * regex over plantName, which matches nothing — the filters already said
	 * tree and Seoul, and the name search was then looking for a plant
	 * literally called that.
	 */
	const consumed: string[] = [];
	if (filters.location) consumed.push(...Object.entries(LOCATION_WORDS).filter(([, v]) => v === filters.location).map(([k]) => k));
	if (filters.type) consumed.push(...Object.entries(TYPE_WORDS).filter(([, v]) => v === filters.type).map(([k]) => k));
	if (filters.category) consumed.push(...Object.entries(CATEGORY_WORDS).filter(([, v]) => v === filters.category).map(([k]) => k));

	let terms = q;
	for (const word of consumed.sort((a, b) => b.length - a.length)) {
		terms = terms.replace(new RegExp(`\\b${word}\\b`, 'g'), ' ');
	}
	terms = terms
		.replace(/(?:under|below|less than|cheaper than|max(?:imum)?)\s*₩?\s*[\d,]+\s*(won)?/g, ' ')
		/* the words that chose the INTENT are consumed too: "show me growers"
		   must not end up searching for a grower literally called "growers" */
		.replace(/\b(agents?|growers?|suppliers?|nurser(?:y|ies)|sellers?|articles?|community|posts?|board|map)\b/g, ' ')
		.replace(/\bhow much\b/g, ' ')
		.replace(/\b(find|show|me|looking|for|recommend|recommendation|suggest|cheap|cheapest|inexpensive|affordable|budget|expensive|best|good|nice|in|at|near|a|an|the|please|with|some|any|what|which|is|are|do|does|did|can|could|would|you|your|have|has|i|my|want|need|plant|plants|something|anything|tell|about|list|all|how|much|many|there|get|got|know|like|price|cost|available|stock|who|whose|whom|where|when|why)\b/g, ' ')
		.replace(/[?!.,]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	let intent = pick();

	/*
	 * Last resort before giving up: a question that matched no keyword but
	 * still has content words is most likely naming something — "tell me
	 * about Calathea Orbifolia" has no filter and no search verb, yet it is
	 * plainly a catalogue question. Trying the name costs one indexed query
	 * and the service reports honestly when it finds nothing, which is a
	 * better answer than a capability list.
	 */
	let guessed = false;
	if (intent === AssistantIntent.UNKNOWN_OR_UNSUPPORTED && terms.length > 2) {
		intent = AssistantIntent.PLANT_SEARCH;
		guessed = true;
	}

	return { intent, terms, filters, guessed };
};
