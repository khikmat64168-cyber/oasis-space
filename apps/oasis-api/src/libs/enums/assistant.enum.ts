import { registerEnumType } from '@nestjs/graphql';

/**
 * What kind of question the assistant received.
 *
 * Routing is deliberately deterministic rather than model-decided: the router
 * only ever picks which READ tools run, and a wrong guess by a language model
 * would be a wrong database query. It is also free, which matters because most
 * questions resolve without a generation call at all.
 */
export enum AssistantIntent {
	PLANT_SEARCH = 'PLANT_SEARCH',
	PLANT_DETAILS = 'PLANT_DETAILS',
	PLANT_CARE = 'PLANT_CARE',
	AGENT_SEARCH = 'AGENT_SEARCH',
	AGENT_PROFILE = 'AGENT_PROFILE',
	MAP_LOCATION = 'MAP_LOCATION',
	COMMUNITY_ARTICLE = 'COMMUNITY_ARTICLE',
	CUSTOMER_SERVICE = 'CUSTOMER_SERVICE',
	ORDER_INFORMATION = 'ORDER_INFORMATION',
	GENERAL_OASIS_INFORMATION = 'GENERAL_OASIS_INFORMATION',
	/** hello / thanks — answered without touching a tool */
	GREETING = 'GREETING',
	UNKNOWN_OR_UNSUPPORTED = 'UNKNOWN_OR_UNSUPPORTED',
}
registerEnumType(AssistantIntent, { name: 'AssistantIntent' });

/** Where a cited passage came from. Every value maps to a real Oasis route. */
export enum AssistantSourceType {
	PLANT = 'PLANT',
	AGENT = 'AGENT',
	ARTICLE = 'ARTICLE',
	HELP = 'HELP',
	ORDER = 'ORDER',
}
registerEnumType(AssistantSourceType, { name: 'AssistantSourceType' });
