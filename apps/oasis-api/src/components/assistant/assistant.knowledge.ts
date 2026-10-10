import { AssistantSourceType } from '../../libs/enums/assistant.enum';

/**
 * The help-centre corpus the assistant can cite.
 *
 * PAIRED FILE — the editorial copy also lives at
 * `oasis-demo/libs/components/cs/helpContent.ts`, which is what /cs renders.
 * The two repositories do not share a package, so this is a deliberate second
 * copy rather than an import. Edit both, or move the canonical copy behind a
 * query and have /cs read it; the duplication is recorded in
 * `docs/ai-assistant.md` rather than being left for someone to discover.
 *
 * Every answer here describes what the platform ACTUALLY does. Where a
 * capability does not exist the answer says so, because the assistant will
 * quote this verbatim and must not invent a feature.
 */
export interface HelpPassage {
	id: string;
	title: string;
	body: string;
	/** the real route a reader is sent to */
	href: string;
	type: AssistantSourceType;
}

export const HELP_CORPUS: HelpPassage[] = [
	{
		id: 'help-order-place',
		title: 'How do I order a plant?',
		body: 'Open the plant you want and press Order now. You choose a delivery address, a city and an installation date, and the order goes to the grower who listed that plant. You need an account to order, and the plant must have stock on hand.',
		href: '/cs',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'help-order-status',
		title: 'What do the order statuses mean?',
		body: 'An order line moves through four stages: Pending while the grower reviews it, Confirmed once they accept, In transit once it leaves the nursery, and Installed when it has been planted on site. Installed is the finished state — these are trees that get planted, so delivery is not the end of the job. A line can also be Cancelled.',
		href: '/orders',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'help-order-cancel',
		title: 'Can I cancel an order?',
		body: 'A client can cancel a line while it is still Pending or Confirmed. Once a line is In transit it can no longer be cancelled from the orders page; contact the grower instead. Cancelling returns the reserved stock to the listing.',
		href: '/orders',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'help-payment',
		title: 'How does payment work?',
		body: 'Orders are recorded, not charged. Oasis Space does not process card payments: amounts are shown in Korean won so you and the grower agree on a figure, and settlement happens between you directly. There is no online checkout and no stored card.',
		href: '/cs',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'help-delivery',
		title: 'Who delivers and installs the plant?',
		body: 'The grower who listed the plant arranges delivery and installation. Each listing carries the city it is supplied from and, where the grower has set one, a delivery radius in kilometres. The installation date you choose when ordering is the date the grower works towards.',
		href: '/cs',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'help-contact-agent',
		title: 'Can I message a grower?',
		body: 'Not yet. The message box on a plant page and on a grower profile prepares a question but does not deliver it — there is no per-recipient messaging in the platform. Growers publish a phone number on their profile, and calling that is the way to reach them today.',
		href: '/agent',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'help-account',
		title: 'How do I create an account?',
		body: 'Pick Create account on the sign-in page. You choose a nickname, which is what you sign in with, a password and a mobile number. A full name and an email address are optional. There is no email or social sign-in yet.',
		href: '/account/join',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'help-agent-role',
		title: 'How do I become a grower?',
		body: 'Choose "I grow and supply plants" when you create your account. Growers list plants, set stock, confirm incoming orders and manage accessories from My Page. An administrator assigns the agent role; it is not granted automatically.',
		href: '/account/join',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'help-stock',
		title: 'What does stock mean on a listing?',
		body: 'Stock is how many units the grower has on hand right now. It drops when a client orders and returns if that line is cancelled, so it is the single figure the whole platform reads. A plant showing zero on hand cannot be ordered.',
		href: '/plants',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'help-3d',
		title: 'Why do some plants have a 3D model?',
		body: 'Growers can upload a .glb model with their listing. Where one exists the plant page shows it in place of the first photograph and you can rotate it. Listings without a model fall back to a representative model for that plant type, which is labelled as a preview rather than the specimen itself.',
		href: '/plants',
		type: AssistantSourceType.HELP,
	},
];

/**
 * Static brand facts, for GENERAL_OASIS_INFORMATION.
 *
 * Deliberately short and checkable. No founding dates, headcounts, awards or
 * partner claims — none of that exists anywhere in the product.
 */
export const ABOUT_CORPUS: HelpPassage[] = [
	{
		id: 'about-what',
		title: 'What Oasis Space is',
		body: 'Oasis Space is a botanical marketplace in South Korea. Growers list plants they can supply; clients order them and the grower delivers and installs on an agreed date. The platform connects the two and tracks the order through to installation.',
		href: '/about',
		type: AssistantSourceType.HELP,
	},
	{
		id: 'about-roles',
		title: 'Who uses Oasis Space',
		body: 'There are three kinds of account. A client browses and orders plants. An agent is a grower or nursery who lists plants and fulfils orders. An administrator oversees the catalogue and the platform. Browsing and reading are open to anyone; ordering needs an account.',
		href: '/about',
		type: AssistantSourceType.HELP,
	},
];
