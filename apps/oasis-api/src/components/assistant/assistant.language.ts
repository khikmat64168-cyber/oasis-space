/**
 * The language a question was asked in, and the fixed replies in that language.
 *
 * WHY THIS EXISTS. Most answers are written by the model, which is told to
 * reply in the language of the question and does. But three branches never
 * reach the model — a greeting, an identity question, and "nothing matched" —
 * because none of them needs a database read or a paid call. Those branches
 * were hard-coded English, so a question asked in Uzbek came back in English
 * and read as if the assistant had not understood it.
 *
 * Detection is deliberately crude: it picks between four languages from
 * scripts and a small marker-word list. It is not a language identifier and
 * does not need to be — the only thing riding on it is which fixed sentence
 * is returned, and English is a safe default when it is unsure.
 *
 * `uz` is here although the site itself ships en/kr/ru: the assistant is asked
 * questions in Uzbek by the people building and demonstrating it, and the
 * model answers them perfectly well once the question reaches it.
 */

export type AssistantLanguage = 'en' | 'uz' | 'ko' | 'ru';

const HANGUL = /[가-힣]/;
const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * Latin-script Uzbek markers.
 *
 * Function words and very common question words only — nothing that is also
 * an English word. `o'` / `g'` carry an apostrophe which `normaliseApostrophes`
 * has already flattened to a plain one by the time this runs.
 */
const UZ_MARKERS = [
	'salom', 'assalom', 'alaykum', 'rahmat', 'raxmat', 'qanday', 'qanaqa', 'nima', 'nimalar', 'qancha', 'qayer', 'qaysi',
	'bormi', 'mavjud', 'kerak', 'menga', 'mening', 'sizda', 'sizning', 'uchun', 'haqida', 'bilan',
	'olasan', 'olasiz', 'bera', 'bering', 'ayting', 'korsat', "ko'rsat", 'yoki', 'lekin', 'ham',
	'eng', 'arzon', 'qimmat', 'yaxshi', 'yangi', 'katta', 'kichik',
	"o'simlik", 'osimlik', 'gul', 'daraxt', 'narx', 'buyurtma', 'yetkaz', 'sotib',
	'yetishtiruvchi', 'sotuvchi', "bog'bon", 'maqola', 'xarita', 'kimlar', 'kimsan', 'kimsiz',
];

/** Cheap, order-sensitive: script first, then Latin markers, then English. */
export const detectLanguage = (rawQuestion: string): AssistantLanguage => {
	const q = normaliseApostrophes(String(rawQuestion ?? '').toLowerCase());
	if (HANGUL.test(q)) return 'ko';
	if (CYRILLIC.test(q)) return 'ru';

	/* A marker must be a whole word or the start of one: "gul" is Uzbek for
	   flower, and it also sits inside the English word "regular". */
	const isUzbek = UZ_MARKERS.some((m) => new RegExp(`(?<![a-z'])${escape(m)}`).test(q));
	return isUzbek ? 'uz' : 'en';
};

/** `o‘simlik`, `o’simlik` and `o'simlik` are the same word to everything here. */
export const normaliseApostrophes = (text: string): string =>
	String(text ?? '').replace(/[‘’ʻʼ`´]/g, "'");

const escape = (word: string): string => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every fixed sentence the assistant can say without a model.
 *
 * The English wording is unchanged from what these branches said before, so
 * the English behaviour is exactly as it was; the other three are translations
 * of it. They state the same facts — nothing here promises a capability that
 * the English copy does not.
 */
export type MessageKey =
	| 'greeting'
	| 'identity'
	| 'unknown'
	| 'emptyPlants'
	| 'emptyAgents'
	| 'emptyArticles'
	| 'emptyHelp'
	| 'emptyOrders'
	| 'emptyGeneric'
	| 'ordersSignedOut'
	| 'ordersWrongRole';

const MESSAGES: Record<MessageKey, Record<AssistantLanguage, string>> = {
	greeting: {
		en: 'Hello. Ask me about a plant in the catalogue, a grower, how ordering works, or your own orders.',
		uz: "Assalomu alaykum. Katalogdagi o'simliklar, ularni yetishtiruvchilar, buyurtma berish tartibi yoki o'z buyurtmalaringiz haqida so'rang.",
		ko: '안녕하세요. 카탈로그의 식물, 재배자, 주문 방법, 또는 회원님의 주문에 대해 물어보세요.',
		ru: 'Здравствуйте. Спросите о растениях в каталоге, о поставщиках, о том, как оформить заказ, или о ваших заказах.',
	},
	identity: {
		en: 'I am the Oasis Space assistant — that is what you can call me. I answer questions about the catalogue, the growers, community articles, how ordering works, and your own orders.',
		uz: "Men Oasis Space yordamchisiman — shunday chaqirsangiz bo'ladi. Katalog, yetishtiruvchilar, jamoa maqolalari, buyurtma berish tartibi va o'z buyurtmalaringiz haqidagi savollarga javob beraman.",
		ko: '저는 Oasis Space 어시스턴트입니다. 카탈로그, 재배자, 커뮤니티 글, 주문 방법, 그리고 회원님의 주문에 대해 답해 드립니다.',
		ru: 'Я ассистент Oasis Space — так меня и можно называть. Отвечаю на вопросы о каталоге, поставщиках, статьях сообщества, оформлении заказа и о ваших заказах.',
	},
	unknown: {
		en: 'I only know about Oasis Space — the plants in the catalogue, the growers who supply them, community articles, how ordering works, and your own orders. I could not find anything here matching that.',
		uz: "Men faqat Oasis Space haqida bilaman — katalogdagi o'simliklar, ularni yetkazib beradigan yetishtiruvchilar, jamoa maqolalari, buyurtma berish tartibi va sizning buyurtmalaringiz. Savolingizga mos hech narsa topa olmadim.",
		ko: '저는 Oasis Space에 대해서만 압니다 — 카탈로그의 식물, 이를 공급하는 재배자, 커뮤니티 글, 주문 방법, 그리고 회원님의 주문입니다. 질문에 해당하는 내용은 찾지 못했습니다.',
		ru: 'Я знаю только об Oasis Space — о растениях в каталоге, о поставляющих их поставщиках, о статьях сообщества, об оформлении заказа и о ваших заказах. По вашему вопросу я ничего не нашёл.',
	},
	emptyPlants: {
		en: 'Nothing in the catalogue matches that right now. Try a different city, plant type or price.',
		uz: "Hozircha katalogda bunga mos narsa yo'q. Boshqa shahar, o'simlik turi yoki narxni sinab ko'ring.",
		ko: '지금 카탈로그에는 해당하는 것이 없습니다. 다른 도시, 식물 종류 또는 가격으로 찾아보세요.',
		ru: 'Сейчас в каталоге нет ничего подходящего. Попробуйте другой город, вид растения или цену.',
	},
	emptyAgents: {
		en: 'I could not find a grower matching that.',
		uz: "Bunga mos yetishtiruvchi topa olmadim.",
		ko: '해당하는 재배자를 찾지 못했습니다.',
		ru: 'Подходящего поставщика я не нашёл.',
	},
	emptyArticles: {
		en: 'No published article covers that yet.',
		uz: "Bu mavzuda hali chop etilgan maqola yo'q.",
		ko: '아직 이 주제를 다룬 게시글이 없습니다.',
		ru: 'Пока нет опубликованной статьи на эту тему.',
	},
	emptyHelp: {
		en: 'The help centre does not cover that yet. The Customer Service page has the full list of topics.',
		uz: "Yordam markazida bu mavzu hali yoritilmagan. To'liq ro'yxat Customer Service sahifasida.",
		ko: '고객 지원에는 아직 이 주제가 없습니다. 전체 주제 목록은 Customer Service 페이지에 있습니다.',
		ru: 'В справочном центре этой темы пока нет. Полный список тем — на странице Customer Service.',
	},
	emptyOrders: {
		en: 'You have no orders yet.',
		uz: "Sizda hali buyurtma yo'q.",
		ko: '아직 주문이 없습니다.',
		ru: 'У вас пока нет заказов.',
	},
	emptyGeneric: {
		en: 'I do not have anything on that.',
		uz: "Bu haqda menda ma'lumot yo'q.",
		ko: '그에 대한 정보는 없습니다.',
		ru: 'По этому у меня ничего нет.',
	},
	ordersSignedOut: {
		en: 'I can look up your orders once you are signed in. Your order history is private, so I will not guess at it.',
		uz: "Buyurtmalaringizni tizimga kirganingizdan keyin ko'ra olaman. Buyurtma tarixingiz shaxsiy, shuning uchun taxmin qilmayman.",
		ko: '로그인하시면 주문을 조회해 드릴 수 있습니다. 주문 내역은 비공개이므로 추측하지 않습니다.',
		ru: 'Я смогу посмотреть ваши заказы после входа в аккаунт. История заказов приватна, поэтому угадывать я не стану.',
	},
	ordersWrongRole: {
		en: 'Order lookup here covers a client’s own orders. For fulfilment work, open the Orders page, which shows the queue for your role.',
		uz: "Bu yerdagi buyurtma qidiruvi mijozning o'z buyurtmalarini qamrab oladi. Ishni bajarish uchun Orders sahifasini oching — u yerda rolingizga tegishli navbat ko'rinadi.",
		ko: '여기서의 주문 조회는 고객 본인의 주문만 다룹니다. 처리 업무는 Orders 페이지에서 역할별 대기열을 확인하세요.',
		ru: 'Здесь поиск заказов охватывает собственные заказы клиента. Для работы с выполнением откройте страницу Orders — там очередь для вашей роли.',
	},
};

/** The fixed sentence for `key`, in `language`; English when a gap appears. */
export const say = (key: MessageKey, language: AssistantLanguage = 'en'): string =>
	MESSAGES[key]?.[language] ?? MESSAGES[key].en;

/**
 * Bridge words, for the help corpus only.
 *
 * The corpus is written in English and is ranked lexically, so a question in
 * another language scores zero against the passage that answers it. Rather
 * than translating the corpus four ways — four copies to keep in step, which
 * is the problem `assistant.knowledge.ts` already warns about — the QUESTION
 * carries a few English terms into the ranking step.
 *
 * This only ever adds recall for ranking. It is not shown to anyone, it is
 * never added to the evidence, and it cannot invent a passage: a term that
 * matches nothing simply scores nothing.
 */
const HELP_BRIDGE: [string, string][] = [
	["to'lov", 'payment pay charged card'],
	['tolov', 'payment pay charged card'],
	['оплат', 'payment pay charged card'],
	['결제', 'payment pay charged card'],
	['bekor', 'cancel cancelled'],
	['отмен', 'cancel cancelled'],
	['취소', 'cancel cancelled'],
	['qaytar', 'refund return'],
	['возврат', 'refund return'],
	['환불', 'refund return'],
	['yetkaz', 'delivery deliver install installation'],
	['доставк', 'delivery deliver install installation'],
	['배송', 'delivery deliver install installation'],
	["o'rnatish", 'install installation'],
	['설치', 'install installation'],
	['buyurtma', 'order ordering place'],
	['заказ', 'order ordering place'],
	['оформит', 'order ordering place'],
	['주문', 'order ordering place'],
	['holat', 'status pending confirmed transit installed'],
	['статус', 'status pending confirmed transit installed'],
	['상태', 'status pending confirmed transit installed'],
	['hisob', 'account sign up register'],
	['аккаунт', 'account sign up register'],
	['계정', 'account sign up register'],
];

/** The question plus any English terms its words imply; unchanged for English. */
export const bridgeForHelp = (question: string, language: AssistantLanguage): string => {
	if (language === 'en') return question;
	const q = normaliseApostrophes(String(question ?? '').toLowerCase());
	const hints = HELP_BRIDGE.filter(([word]) => q.includes(word)).map(([, terms]) => terms);
	return hints.length ? `${question} ${hints.join(' ')}` : question;
};
