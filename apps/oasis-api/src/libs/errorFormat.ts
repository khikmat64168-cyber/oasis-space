import { BadRequestException, Logger, ValidationError } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ErrorCode, MESSAGE_CODES, Message } from './Errors';

/**
 * How every GraphQL error leaves the API.
 *
 *   { message, extensions: { code, fieldErrors?, requestId? } }
 *
 * The one formatter in the app (GraphQLModule `formatError`). It used to
 * read the original message from `extensions.exception.response` and
 * `extensions.response` — Apollo 3 locations. Under Apollo 4 with Nest 10 the
 * HttpException's body arrives as `extensions.originalError`, so every
 * validation failure fell through to the generic `error.message`, "Bad
 * Request Exception", and every unexpected exception went out with its raw
 * text (a Mongo cast error, a TypeError) attached.
 *
 * Three kinds of failure come through here:
 *  - an HttpException a guard, pipe or service threw on purpose: its message
 *    is authored and safe, and is kept; the code is taken from the message
 *    when it is a known one, otherwise from the status;
 *  - a GraphQL-level failure (bad query, wrong variable type): kept as is;
 *  - anything else is a bug or an outage: the client gets a fixed message
 *    and a request id, and the real error goes to the log under that id.
 */

export interface FieldError {
	/** dotted path within the argument, e.g. `memberPassword` or `search.text` */
	field: string;
	/** class-validator constraint name, e.g. `isLength`, `isNotEmpty` */
	constraint: string;
	/** class-validator's own sentence — for logs; the client words its own */
	message: string;
}

const logger = new Logger('GraphQLError');

/** an authored code such as INVALID_PHONE, or WRONG_CODE:3 with its detail */
const CODE_SHAPE = /^[A-Z][A-Z0-9_]{2,}(?::.*)?$/;

const STATUS_CODES: Record<number, ErrorCode> = {
	400: ErrorCode.BAD_REQUEST,
	401: ErrorCode.UNAUTHENTICATED,
	403: ErrorCode.FORBIDDEN,
	404: ErrorCode.NOT_FOUND,
	409: ErrorCode.CONFLICT,
	429: ErrorCode.RATE_LIMITED,
};

/** codes Apollo itself assigns to a malformed operation — not ours to rename */
const GRAPHQL_CODES = new Set([
	'GRAPHQL_PARSE_FAILED',
	'GRAPHQL_VALIDATION_FAILED',
	'BAD_USER_INPUT',
	'PERSISTED_QUERY_NOT_FOUND',
	'OPERATION_RESOLUTION_FAILURE',
]);

export const SAFE_INTERNAL_MESSAGE = 'Something went wrong on our side. Please try again in a moment.';

/** class-validator's tree, flattened to one entry per failed constraint */
export const flattenValidationErrors = (errors: ValidationError[], parent = ''): FieldError[] =>
	errors.flatMap((e) => {
		const field = parent ? `${parent}.${e.property}` : e.property;
		const own = Object.entries(e.constraints ?? {}).map(([constraint, message]) => ({ field, constraint, message }));
		return [...own, ...flattenValidationErrors(e.children ?? [], field)];
	});

/**
 * The global ValidationPipe's exceptionFactory. The default throws a 400
 * whose message is an array of English sentences, which reached the client as
 * "Bad Request Exception"; this keeps which field failed and how.
 */
export const validationExceptionFactory = (errors: ValidationError[]) =>
	new BadRequestException({
		statusCode: 400,
		code: ErrorCode.VALIDATION_ERROR,
		message: ErrorCode.VALIDATION_ERROR,
		fieldErrors: flattenValidationErrors(errors),
	});

const codeForMessage = (message: string, status?: number): string => {
	const known = MESSAGE_CODES[message as Message];
	if (known) return known;
	if (CODE_SHAPE.test(message)) return message.split(':')[0];
	return (status && STATUS_CODES[status]) || ErrorCode.BAD_REQUEST;
};

interface Formatted {
	message: string;
	extensions?: Record<string, any>;
	[key: string]: any;
}

export const formatGraphQLError = (formatted: Formatted, error?: unknown): Formatted => {
	const ext = formatted.extensions ?? {};
	// the HttpException body: Apollo 4 location first, then the Apollo 3 ones
	let body = ext.originalError ?? ext.exception?.response ?? ext.response;
	// an HttpException wrapped in another one (`new XException(err)`) arrives
	// as the inner exception object: unwrap it rather than lose its code
	if (body && typeof body.statusCode !== 'number' && body.response && typeof body.status === 'number') {
		body = typeof body.response === 'object' ? body.response : { statusCode: body.status, message: body.response };
	}
	const status: number | undefined = body?.statusCode;

	// 1. thrown on purpose by a guard, pipe or service
	if (body && typeof status === 'number') {
		const raw = Array.isArray(body.message) ? body.message.join('; ') : String(body.message ?? formatted.message);
		const code: string = body.code ?? codeForMessage(raw, status);
		return {
			message: raw,
			extensions: {
				code,
				...(body.fieldErrors ? { fieldErrors: body.fieldErrors } : {}),
			},
		};
	}

	// 2. the operation itself was malformed
	if (GRAPHQL_CODES.has(ext.code)) {
		return { message: formatted.message, extensions: { code: ext.code } };
	}

	const original = (error as { originalError?: unknown })?.originalError ?? error;

	// an id that is not an ObjectId at all (BSON) or does not fit the field
	// (a mongoose CastError) is the caller's input, not our fault
	const name = (original as { name?: string })?.name;
	if (name === 'BSONError' || name === 'CastError') {
		return { message: 'INVALID_ID', extensions: { code: ErrorCode.BAD_REQUEST } };
	}

	// 3. not anticipated: say nothing about it, log all of it
	const requestId = randomUUID();
	logger.error(
		`[${requestId}] ${formatted.message} (path: ${(formatted.path ?? []).join('.') || '-'})`,
		original instanceof Error ? original.stack : undefined,
	);
	return {
		message: SAFE_INTERNAL_MESSAGE,
		extensions: { code: ErrorCode.INTERNAL_SERVER_ERROR, requestId },
	};
};
