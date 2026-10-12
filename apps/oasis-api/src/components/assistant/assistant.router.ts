import { AssistantIntent } from '../../libs/enums/assistant.enum';
import { PlantCategory, PlantLocation, PlantType } from '../../libs/enums/plant.enum';
import { AssistantLanguage, detectLanguage, normaliseApostrophes } from './assistant.language';

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
	/** what the fixed, model-free replies should be written in */
	language: AssistantLanguage;
	/**
	 * "who are you", "ismingiz nima". Answered from a fixed sentence rather
	 * than from the help corpus: the corpus describes the PLATFORM, and
	 * ranking an identity question against it returned either nothing or,
	 * worse, a passage about client and agent accounts.
	 */
	identity?: boolean;
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

/**
 * A city name with a case ending allowed on the end.
 *
 * Uzbek marks place with a suffix — Goyangda (in Goyang), Goyangdan (from
 * Goyang) — and a plain word boundary refuses all of them, so a question
 * naming a real city routed to UNKNOWN. The endings are listed rather than
 * allowing any letters, so "Jeju" still cannot match inside a longer name.
 */
const CASE_SUFFIX = '(?:da|dan|ga|dagi|gacha|ning|niki)?';
const cityPattern = (word: string): RegExp =>
	new RegExp(`(?<![a-z])${escapeWord(word)}${CASE_SUFFIX}(?![a-z])`);

const escapeWord = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Stem matching, for the words `has` cannot handle.
 *
 * `has` leans on `\b`, which only asserts between ASCII word characters: in
 * JavaScript `\b안녕\b` never matches, because 안 is not a word character to
 * the engine. Korean and Russian therefore need a plain substring test.
 *
 * Latin stems get a START boundary instead of a whole-word one. Uzbek
 * agglutinates — o'simlik, o'simliklar, o'simliklaringiz are one word with
 * three endings — so the suffix must stay free while the prefix must not: the
 * English word "regular" contains "gul", which is Uzbek for flower.
 */
const hasStem = (text: string, stems: string[]): boolean =>
	stems.some((stem) =>
		/^[a-z' ]+$/.test(stem)
			? new RegExp(`(?<![a-z'])${escapeWord(stem)}`).test(text)
			: text.includes(stem),
	);

/**
 * The same enum values, spelled the way a reader actually types them.
 *
 * Only ADDITIONS: the English tables above still run first, so nothing that
 * resolved before resolves differently now. Matching uses `hasStem`, which
 * leaves the suffix free — Uzbek agglutinates, so "Seulda" (in Seoul) and
 * "Seuldan" (from Seoul) are the same city as "Seul".
 *
 * Russian city names are present only where the usual spelling is not in
 * doubt. A city that is missing here simply falls through to the English
 * name, exactly as it did before — a miss, never a wrong city.
 */
const EXTRA_LOCATION_WORDS: [string, PlantLocation][] = [
	['서울', PlantLocation.SEOUL], ['seul', PlantLocation.SEOUL], ['сеул', PlantLocation.SEOUL],
	['부산', PlantLocation.BUSAN], ['pusan', PlantLocation.BUSAN], ['пусан', PlantLocation.BUSAN],
	['인천', PlantLocation.INCHEON], ['инчхон', PlantLocation.INCHEON],
	['대구', PlantLocation.DAEGU], ['тэгу', PlantLocation.DAEGU],
	['대전', PlantLocation.DAEJON],
	['광주', PlantLocation.GWANGJU],
	['울산', PlantLocation.ULSAN],
	['수원', PlantLocation.SUWON],
	['경주', PlantLocation.GYEONGJU],
	['전주', PlantLocation.CHONJU],
	['청주', PlantLocation.CHEONGJU],
	['창원', PlantLocation.CHANGWON],
	['고양', PlantLocation.GOYANG],
	['용인', PlantLocation.YONGIN],
	['성남', PlantLocation.SEONGNAM],
	['포항', PlantLocation.POHANG],
	['부천', PlantLocation.BUCHEON],
	['안산', PlantLocation.ANSAN],
	['제주', PlantLocation.JEJU], ['чеджу', PlantLocation.JEJU],
];

const EXTRA_TYPE_WORDS: [string, PlantType][] = [
	['daraxt', PlantType.TREE], ['дерев', PlantType.TREE], ['나무', PlantType.TREE],
	['gul', PlantType.FLOWER], ['цвет', PlantType.FLOWER], ['꽃', PlantType.FLOWER],
	['buta', PlantType.SHRUB], ['кустарник', PlantType.SHRUB], ['관목', PlantType.SHRUB],
	['mevali', PlantType.FRUIT_TREE], ['плодов', PlantType.FRUIT_TREE], ['과수', PlantType.FRUIT_TREE], ['과일나무', PlantType.FRUIT_TREE],
	['palma', PlantType.PALM], ['пальм', PlantType.PALM], ['야자', PlantType.PALM],
	['tok ', PlantType.VINE], ['лиан', PlantType.VINE], ['덩굴', PlantType.VINE],
	['sukkulent', PlantType.SUCCULENT], ['суккулент', PlantType.SUCCULENT], ['다육', PlantType.SUCCULENT],
	['bambuk', PlantType.BAMBOO], ['бамбук', PlantType.BAMBOO], ['대나무', PlantType.BAMBOO],
	['qoplama', PlantType.GROUND_COVER], ['почвопокровн', PlantType.GROUND_COVER], ['지피', PlantType.GROUND_COVER],
	['xonaki', PlantType.INDOOR_PLANT], ['uy o\'simlik', PlantType.INDOOR_PLANT], ['комнатн', PlantType.INDOOR_PLANT], ['실내', PlantType.INDOOR_PLANT],
];

/* No entry here may repeat one above: the two loops run independently, so a
   word in both tables would silently set a type AND a category. */
const EXTRA_CATEGORY_WORDS: [string, PlantCategory][] = [
	['doim yashil', PlantCategory.EVERGREEN], ['вечнозелен', PlantCategory.EVERGREEN], ['상록', PlantCategory.EVERGREEN],
	['gullaydigan', PlantCategory.FLOWERING], ['цветущ', PlantCategory.FLOWERING], ['개화', PlantCategory.FLOWERING],
	['manzarali', PlantCategory.ORNAMENTAL], ['декоратив', PlantCategory.ORNAMENTAL], ['관상', PlantCategory.ORNAMENTAL],
	['yeyiladigan', PlantCategory.EDIBLE], ['съедобн', PlantCategory.EDIBLE], ['식용', PlantCategory.EDIBLE],
	['mavsumiy', PlantCategory.SEASONAL], ['сезонн', PlantCategory.SEASONAL], ['계절', PlantCategory.SEASONAL],
	['tashqi', PlantCategory.OUTDOOR], ['уличн', PlantCategory.OUTDOOR], ['실외', PlantCategory.OUTDOOR],
];

/** cheap, inclusive signals — the router errs towards asking rather than acting */
const ORDER_WORDS = ['my order', 'my orders', 'order status', 'where is my', 'my delivery', 'my purchase'];
const CARE_WORDS = ['care', 'water', 'watering', 'sunlight', 'light', 'humidity', 'temperature', 'prune', 'repot', 'soil', 'fertilis', 'fertiliz', 'look after', 'keep alive'];
const CS_WORDS = ['delivery policy', 'refund', 'cancel', 'return policy', 'shipping', 'payment', 'how do i order', 'how long', 'contact', 'support', 'install'];
const AGENT_WORDS = ['agent', 'grower', 'supplier', 'nursery', 'seller'];
const ARTICLE_WORDS = ['article', 'community', 'post', 'board', 'blog', 'news'];
const MAP_WORDS = ['map', 'near me', 'nearby', 'which city', 'where can i find', 'closest'];
const SEARCH_WORDS = ['find', 'show me', 'looking for', 'recommend', 'suggest', 'cheap', 'inexpensive', 'affordable', 'under', 'buy'];
const ABOUT_WORDS = ['what is oasis', 'about oasis', 'what do you do', 'how does oasis'];

/**
 * The same signals in Uzbek, Korean and Russian.
 *
 * These are STEMS, not whole words — see `hasStem`. They are kept in a second
 * set rather than merged into the English lists because the two are matched
 * by different rules, and mixing them would silently apply the wrong one.
 */
const ORDER_STEMS = [
	'buyurtmam', 'buyurtmalarim', 'mening buyurtma', 'buyurtmamning',
	'мой заказ', 'мои заказ', 'моего заказа', 'мои покупки', 'заказ мой',
	'내 주문', '제 주문', '주문 상태', '주문 내역',
];
const CARE_STEMS = [
	"sug'or", 'sugor', 'parvarish', "o'g'it", 'ogit', 'namlik', 'quyosh', 'yorug', 'ekish', 'shakl ber',
	'уход', 'полив', 'удобрен', 'освещен', 'пересад',
	'관리', '물주기', '햇빛', '분갈이', '비료',
];
const CS_STEMS = [
	'yetkaz', "to'lov", 'tolov', 'qaytar', 'bekor', 'aloqa', "o'rnatish", 'ornatish', 'kafolat',
	/* the generic word for an order belongs here, not above: asking HOW
	   ordering works is a help question and needs no account */
	'buyurtma', 'buyurtma berish', 'qanday buyurtma',
	'доставк', 'оплат', 'возврат', 'отмен', 'гаранти', 'заказ', 'оформит',
	'배송', '결제', '환불', '취소', '설치', '주문',
];
const AGENT_STEMS = [
	'sotuvchi', 'yetishtiruvchi', "bog'bon", 'bogbon', 'ta\'minotchi',
	'продавец', 'продавц', 'поставщик', 'питомник',
	'판매자', '재배자', '농장',
];
const ARTICLE_STEMS = ['maqola', 'jamoa', 'yangilik', 'статья', 'стать', 'сообществ', 'новост', '게시글', '커뮤니티', '글'];
const MAP_STEMS = ['xarita', 'yaqin', 'qaysi shahar', 'qayerda', 'карт', 'рядом', 'поблизости', '지도', '근처', '어느 도시'];
const SEARCH_STEMS = [
	'izla', 'topish', 'topa', "ko'rsat", 'korsat', 'tavsiya', 'arzon', 'sotib ol', 'kerak', 'tanla',
	'найти', 'найд', 'покажи', 'дешев', 'купить', 'посовет',
	'찾', '추천', '저렴', '구매', '살 수',
];
const ABOUT_STEMS = [
	'oasis nima', 'oasis haqida', 'nima qila olasan', 'nima qila olasiz', 'qanday ishlaydi',
	'что такое oasis', 'об oasis', 'что ты умеешь', 'как это работает',
	'오아시스가 뭐', '오아시스는 무엇', '무엇을 할 수',
];
const PLANT_TOPIC_STEMS = [
	"o'simlik", 'osimlik', 'gul', 'daraxt', 'katalog', 'narx', 'qancha', 'bormi', 'mavjud', 'sotasiz', 'sotiladi',
	'растени', 'цвет', 'дерев', 'катало', 'цена', 'цены', 'сколько', 'есть ли',
	'식물', '꽃', '나무', '카탈로그', '가격', '얼마', '재고',
];

/**
 * Identity questions.
 *
 * "What can I call you?" used to fall through to UNKNOWN, which answered with
 * a capability list — a reply that reads as a failure to a question the
 * assistant can answer in one sentence.
 */
const IDENTITY_WORDS = [
	'who are you', 'what are you', 'what can i call you', 'what should i call you', 'your name',
	'what is your name', 'are you a bot', 'are you an ai', 'are you ai', 'are you a robot', 'are you human',
];
const IDENTITY_STEMS = [
	'isming', 'nomingiz', 'nomi nima', 'kimsan', 'kimsiz', 'kim bolasan', 'botmisan', 'robotmisan',
	'seni nima deb', 'sizni nima deb', "sun'iy intellekt",
	'как тебя зовут', 'как вас зовут', 'кто ты', 'кто вы', 'твоё имя', 'твое имя', 'ты бот',
	'이름이 뭐', '이름은', '누구세요', '누구야', '봇인가',
];

/** a greeting is not a question; answering it with a capability list reads as a failure */
const GREETING_RE =
	/^(hi|hey|hello|yo|good (morning|afternoon|evening)|thanks?|thank you|thx|ok|okay|bye|(?:as)?salom(?:u? alaykum)?|assalom|rahmat|raxmat|xayr|annyeong|안녕(?:하세요)?|감사(?:합니다)?|고마워|привет|здравствуйте|здравствуй|спасибо|пока)[\s!.?]*$/i;

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
	/* the curly apostrophe a phone keyboard produces must not make o‘simlik a
	   different word from o'simlik */
	const q = normaliseApostrophes(String(rawQuestion ?? '').toLowerCase()).trim();
	const language = detectLanguage(q);
	const filters: RoutedQuestion['filters'] = {};

	for (const [word, loc] of Object.entries(LOCATION_WORDS)) {
		// word boundary, so "seoul" does not match inside another token
		if (word.length > 2 && cityPattern(word).test(q)) {
			filters.location = loc;
			break;
		}
	}
	/*
	 * Whole word, optional plural — NOT a substring.
	 *
	 * `includes` read "a flowering shrub" as type FLOWER, because "flower"
	 * sits inside "flowering": the type was taken from a word that describes
	 * the category, and the shrub the reader actually asked for was never
	 * filtered on. The same shape would have read "palmetto" as a palm.
	 */
	const wholeWord = (text: string, word: string): boolean =>
		new RegExp(`(?<![a-z])${escapeWord(word)}(?:s|es)?(?![a-z])`).test(text);

	for (const [word, t] of Object.entries(TYPE_WORDS)) {
		if (wholeWord(q, word)) {
			filters.type = t;
			break;
		}
	}
	for (const [word, c] of Object.entries(CATEGORY_WORDS)) {
		if (wholeWord(q, word)) {
			filters.category = c;
			break;
		}
	}
	/* second pass, in the other three languages — only for a field the
	   English pass left unset */
	if (!filters.location) {
		const hit = EXTRA_LOCATION_WORDS.find(([word]) => hasStem(q, [word]));
		if (hit) filters.location = hit[1];
	}
	if (!filters.type) {
		const hit = EXTRA_TYPE_WORDS.find(([word]) => hasStem(q, [word]));
		if (hit) filters.type = hit[1];
	}
	if (!filters.category) {
		const hit = EXTRA_CATEGORY_WORDS.find(([word]) => hasStem(q, [word]));
		if (hit) filters.category = hit[1];
	}

	const ceiling = priceCeiling(q);
	if (ceiling) filters.maxPrice = ceiling;
	if (
		/\b(cheap|cheapest|inexpensive|affordable|budget|lowest price)/.test(q) ||
		/(?<![a-z'])(arzon|arzonroq)/.test(q) ||
		/(дешев|подешевле|недорог)/.test(q) ||
		/(저렴|싼|제일 싼)/.test(q)
	) {
		filters.cheapestFirst = true;
	}

	const identity = has(q, IDENTITY_WORDS) || hasStem(q, IDENTITY_STEMS);

	const pick = (): AssistantIntent => {
		if (GREETING_RE.test(q)) return AssistantIntent.GREETING;

		/* before the catalogue branches: "ismingiz nima" ends in "nima",
		   which is a plant-topic word, and would otherwise search the
		   catalogue for a plant called "ism" */
		if (identity) return AssistantIntent.GENERAL_OASIS_INFORMATION;

		// private data first: it is the one branch with an authorisation gate,
		// so it must not be shadowed by a looser match below
		if (has(q, ORDER_WORDS) || hasStem(q, ORDER_STEMS)) return AssistantIntent.ORDER_INFORMATION;

		if (has(q, ABOUT_WORDS) || hasStem(q, ABOUT_STEMS)) return AssistantIntent.GENERAL_OASIS_INFORMATION;
		if (has(q, CS_WORDS) || hasStem(q, CS_STEMS)) return AssistantIntent.CUSTOMER_SERVICE;
		if (has(q, ARTICLE_WORDS) || hasStem(q, ARTICLE_STEMS)) return AssistantIntent.COMMUNITY_ARTICLE;

		if (has(q, CARE_WORDS) || hasStem(q, CARE_STEMS)) return AssistantIntent.PLANT_CARE;

		if (has(q, AGENT_WORDS) || hasStem(q, AGENT_STEMS)) {
			// on an agent's own page, a bare "tell me about them" is the profile
			return page === 'agent' ? AssistantIntent.AGENT_PROFILE : AssistantIntent.AGENT_SEARCH;
		}

		if (has(q, MAP_WORDS) || hasStem(q, MAP_STEMS) || (page === 'map' && (filters.location || filters.type))) {
			return AssistantIntent.MAP_LOCATION;
		}

		if (
			filters.location ||
			filters.type ||
			filters.category ||
			filters.maxPrice ||
			has(q, SEARCH_WORDS) ||
			hasStem(q, SEARCH_STEMS) ||
			has(q, PLANT_TOPIC_WORDS) ||
			hasStem(q, PLANT_TOPIC_STEMS)
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
	/** the translated words that became a filter; matched by stem, not word */
	const terms0: string[] = [];
	if (filters.location) consumed.push(...Object.entries(LOCATION_WORDS).filter(([, v]) => v === filters.location).map(([k]) => k));
	if (filters.type) consumed.push(...Object.entries(TYPE_WORDS).filter(([, v]) => v === filters.type).map(([k]) => k));
	if (filters.category) consumed.push(...Object.entries(CATEGORY_WORDS).filter(([, v]) => v === filters.category).map(([k]) => k));
	/* and their translations, with whatever suffix was attached: "Seulda"
	   must leave nothing behind for the name search to look for */
	for (const [word, value] of [...EXTRA_LOCATION_WORDS, ...EXTRA_TYPE_WORDS, ...EXTRA_CATEGORY_WORDS] as [string, string][]) {
		if (value === filters.location || value === filters.type || value === filters.category) {
			terms0.push(word.trim());
		}
	}

	let terms = q;
	for (const word of consumed.sort((a, b) => b.length - a.length)) {
		terms = terms.replace(new RegExp(`(?<![a-z])${escapeWord(word)}${CASE_SUFFIX}(?![a-z])`, 'g'), ' ');
	}
	for (const word of terms0.sort((a, b) => b.length - a.length)) {
		terms = /^[a-z' ]+$/.test(word)
			// the suffix goes with the stem: "seulda" -> "", not "da"
			? terms.replace(new RegExp(`(?<![a-z'])${escapeWord(word)}[a-z']*`, 'g'), ' ')
			: terms.split(word).join(' ');
	}
	terms = terms
		.replace(/(?:under|below|less than|cheaper than|max(?:imum)?)\s*₩?\s*[\d,]+\s*(won)?/g, ' ')
		/* the words that chose the INTENT are consumed too: "show me growers"
		   must not end up searching for a grower literally called "growers" */
		.replace(/\b(agents?|growers?|suppliers?|nurser(?:y|ies)|sellers?|articles?|community|posts?|board|map)\b/g, ' ')
		.replace(/\bhow much\b/g, ' ')
		.replace(/\b(find|show|me|looking|for|recommend|recommendation|suggest|cheap|cheapest|inexpensive|affordable|budget|expensive|best|good|nice|in|at|near|a|an|the|please|with|some|any|what|which|is|are|do|does|did|can|could|would|you|your|have|has|i|my|want|need|plant|plants|something|anything|tell|about|list|all|how|much|many|there|get|got|know|like|price|cost|available|stock|who|whose|whom|where|when|why)\b/g, ' ')
		/*
		 * The same sweep for the other three languages.
		 *
		 * Without it an Uzbek question left its own filler behind — "qanday
		 * o'simliklaringiz bor" reached the catalogue as a name search for
		 * "qanday simliklaringiz bor", which matches nothing, and the honest
		 * "nothing matched" that came back looked like an empty catalogue.
		 *
		 * Latin stems are stripped from the start of a word so the Uzbek
		 * suffixes go with them; the Korean and Russian ones are plain
		 * replacements, for the reason `hasStem` gives.
		 */
		.replace(
			/(?<![a-z'])(qanday|qanaqa|qanchalik|qancha|nimalar|nima|qaysi|qayerda|qayer|bormi|bor|mavjud|kerak|menga|mening|sizda|sizning|uchun|haqida|bilan|yoki|ham|eng|yaxshi|yangi|katta|kichik|arzon|qimmat|izla|topish|topa|korsat|ko'rsat|tavsiya|bera|bering|ayting|olasan|olasiz|mumkinmi|iltimos|o'simlik|osimlik|gul|daraxt|narx|katalog|yetishtiruvchi|sotuvchi|bog'bon|ta'minotchi|maqola|jamoa|yangilik|xarita|buyurtma|kimlar|kim)[a-z']*/g,
			' ',
		)
		.replace(
			/(что|какой|какие|какая|где|сколько|есть|нужно|мне|мой|моя|про|или|самый|лучший|новый|дешев\w*|дорог\w*|найти|найд\w*|покажи\w*|растени\w*|цвет\w*|дерев\w*|цена|цены|катало\w*)/g,
			' ',
		)
		.replace(/(있나요|있어요|있습니까|무엇|어떤|어디|얼마|추천|보여|주세요|식물|꽃|나무|카탈로그|가격)/g, ' ')
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
	if (!identity && intent === AssistantIntent.UNKNOWN_OR_UNSUPPORTED && terms.length > 2) {
		intent = AssistantIntent.PLANT_SEARCH;
		guessed = true;
	}

	return { intent, language, identity, terms, filters, guessed };
};
