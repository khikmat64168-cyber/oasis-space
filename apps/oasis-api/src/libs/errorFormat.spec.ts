import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import {
	formatGraphQLError,
	flattenValidationErrors,
	SAFE_INTERNAL_MESSAGE,
	validationExceptionFactory,
} from './errorFormat';
import { Message } from './Errors';

/** what Nest 10 + Apollo 4 hand the formatter for a thrown HttpException */
const fromHttp = (e: { getResponse: () => any; message: string }) => ({
	message: e.message,
	extensions: { code: 'X', originalError: e.getResponse() },
});

describe('formatGraphQLError', () => {
	beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));

	it('keeps an authored code as the code and the message', () => {
		const out = formatGraphQLError(fromHttp(new ConflictException('MEMBER_NICK_TAKEN')));
		expect(out).toEqual({ message: 'MEMBER_NICK_TAKEN', extensions: { code: 'MEMBER_NICK_TAKEN' } });
	});

	it('strips the detail suffix from a code such as WRONG_CODE:3', () => {
		const out = formatGraphQLError(fromHttp(new BadRequestException('WRONG_CODE:3')));
		expect(out.extensions?.code).toBe('WRONG_CODE');
		expect(out.message).toBe('WRONG_CODE:3');
	});

	it('classifies a known Message by meaning, not by the exception class it was thrown in', () => {
		const out = formatGraphQLError(fromHttp(new InternalServerErrorException(Message.NO_DATA_FOUND)));
		expect(out.extensions?.code).toBe('NOT_FOUND');
		expect(out.message).toBe(Message.NO_DATA_FOUND);
	});

	it('falls back to the status for an unknown authored sentence', () => {
		const out = formatGraphQLError(fromHttp(new ForbiddenException('Only the owner may do that')));
		expect(out.extensions?.code).toBe('FORBIDDEN');
	});

	it('carries field errors from the validation pipe', () => {
		const ve = Object.assign(new ValidationError(), {
			property: 'memberPassword',
			constraints: { isLength: 'memberPassword must be shorter than or equal to 12 characters' },
			children: [],
		});
		const out = formatGraphQLError(fromHttp(validationExceptionFactory([ve])));
		expect(out.extensions?.code).toBe('VALIDATION_ERROR');
		expect(out.extensions?.fieldErrors).toEqual([
			{ field: 'memberPassword', constraint: 'isLength', message: expect.any(String) },
		]);
		expect(out.message).not.toMatch(/Bad Request Exception/);
	});

	it('hides an unexpected error behind a safe message and a request id', () => {
		const raw = new Error('Cast to ObjectId failed for value "x" at path "_id" for model "Member"');
		const out = formatGraphQLError(
			{ message: raw.message, extensions: { code: 'INTERNAL_SERVER_ERROR' }, path: ['getMember'] },
			{ originalError: raw },
		);
		expect(out.message).toBe(SAFE_INTERNAL_MESSAGE);
		expect(out.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
		expect(out.extensions?.requestId).toMatch(/^[0-9a-f-]{36}$/);
		expect(JSON.stringify(out)).not.toMatch(/ObjectId|Member/);
	});

	it('unwraps an HttpException that was wrapped in another one', () => {
		const inner = new ConflictException('MEMBER_NICK_TAKEN');
		const out = formatGraphQLError({
			message: 'x',
			extensions: { code: 'INTERNAL_SERVER_ERROR', originalError: inner },
		});
		expect(out.extensions?.code).toBe('MEMBER_NICK_TAKEN');
	});

	it("treats a malformed id as the caller's input, not an internal failure", () => {
		const raw = Object.assign(new Error('input must be a 24 character hex string'), { name: 'BSONError' });
		const out = formatGraphQLError(
			{ message: raw.message, extensions: { code: 'INTERNAL_SERVER_ERROR' } },
			{ originalError: raw },
		);
		expect(out).toEqual({ message: 'INVALID_ID', extensions: { code: 'BAD_REQUEST' } });
	});

	it('passes a malformed operation through with its own code', () => {
		const out = formatGraphQLError({
			message: 'Cannot query field "nope" on type "Query".',
			extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
		});
		expect(out.extensions?.code).toBe('GRAPHQL_VALIDATION_FAILED');
	});
});

describe('flattenValidationErrors', () => {
	it('walks nested inputs to a dotted path', () => {
		const child = Object.assign(new ValidationError(), {
			property: 'text',
			constraints: { isNotEmpty: 'x' },
			children: [],
		});
		const parent = Object.assign(new ValidationError(), { property: 'search', children: [child] });
		expect(flattenValidationErrors([parent])).toEqual([
			{ field: 'search.text', constraint: 'isNotEmpty', message: 'x' },
		]);
	});
});
