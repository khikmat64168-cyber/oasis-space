/**
 * ┌─────────┐
 *  │ PHASE 0 │ ─── KOD KETMA-KETLIK OQIMI
 *  └─────────┘
 *  ─── KOD TAHLILI ──────────────────────────────────────────────────
 *  Bu fayl loyiha bo'ylab ishlatiladigan xato tizimidir.
 *  HttpCode va Message enumlari barcha qatlamlarda (controller,
 *  service) import qilinadi. PHASE 0 — chunki bu yordamchi
 *  modul bo'lib, oqim boshlanishidan oldin tayyor turadi.
 *  ──────────────────────────────────────────────────────────────────
 */

import { registerEnumType } from '@nestjs/graphql';

export enum HttpCode {
	OK = 200,
	CREATED = 201,
	ACCEPTED = 202,
	NO_CONTENT = 204,
	NOT_MODIFIED = 304,
	BAD_REQUEST = 400,
	UNAUTHORIZED = 401,
	FORBIDDEN = 403,
	NOT_FOUND = 404,
	INTERNAL_SERVER_ERROR = 500,
}

export enum Message {
	USED_MEMBER_NICK_OR_PHONE = 'Already used nick or phone',
	SOMETHING_WENT_WRONG = 'Something went wrong!',
	NO_DATA_FOUND = 'No data found!',
	CREATE_FAILED = 'Create failed!',
	UPDATE_FAILED = 'Update failed!',
	REMOVE_FAILED = 'Remove failed!',
	UPLOAD_FAILED = 'Upload failed!',
	BAD_REQUEST = 'Bad Request',

	NO_MEMBER_NICK = 'No member with that member nick!',
	BLOCKED_USER = 'You have been blocked!',
	WRONG_PASSWORD = 'Wrong password, try again!',
	NOT_AUTHENTICATED = 'You are not authenticated, please login first!',
	TOKEN_NOT_EXIST = 'Bearer Token is not provided!',
	ONLY_SPECIFIC_ROLES_ALLOWED = 'Allowed only for members with specific roles!',
	NOT_ALLOWED_REQUEST = 'Not Allowed Request!',
	PROVIDE_ALLOWED_FORMAT = 'Please provide jpg, jpeg, png or webp images!',
	PROVIDE_ALLOWED_MODEL_FORMAT = 'Please provide a .glb or .gltf 3D model!',
	SELF_SUBSCRIPTION_DENIED = 'Self subscription is denied!',

	// Order
	INVALID_ORDER_TRANSITION = 'This order status transition is not allowed!',
	INVALID_INSTALLATION_DATE = 'Installation date must be in the future!',
	NOT_YOUR_ORDER = 'You are not allowed to access or modify this order!',
	INSUFFICIENT_STOCK = 'Not enough stock available for this product!',
}

/**
 * Stable, machine-readable error codes, sent in `extensions.code` on every
 * GraphQL error (see libs/errorFormat.ts). The client maps these to what the
 * user reads; the `message` beside them stays for logs and older callers.
 *
 * A code names what the caller can do about the failure, not which line
 * threw it. Add one only when it lets a form say something more useful.
 */
export enum ErrorCode {
	// input
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	BAD_REQUEST = 'BAD_REQUEST',
	INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
	// authentication
	INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
	UNAUTHENTICATED = 'UNAUTHENTICATED',
	ACCESS_TOKEN_EXPIRED = 'ACCESS_TOKEN_EXPIRED',
	ACCOUNT_BLOCKED = 'ACCOUNT_BLOCKED',
	// registration — the same uniqueness the Member indexes enforce
	MEMBER_NICK_TAKEN = 'MEMBER_NICK_TAKEN',
	PHONE_ALREADY_REGISTERED = 'PHONE_ALREADY_REGISTERED',
	EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
	ACCOUNT_REGISTRATION_FAILED = 'ACCOUNT_REGISTRATION_FAILED',
	// authorization
	FORBIDDEN = 'FORBIDDEN',
	// resources
	NOT_FOUND = 'NOT_FOUND',
	CONFLICT = 'CONFLICT',
	// everything else
	RATE_LIMITED = 'RATE_LIMITED',
	INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

/**
 * The code each authored Message means. Services throw these strings, often
 * inside an exception class that does not match them (NO_DATA_FOUND inside an
 * InternalServerErrorException, for one); the message is the reliable signal,
 * so it decides the code.
 */
export const MESSAGE_CODES: Partial<Record<Message, ErrorCode | string>> = {
	[Message.NO_DATA_FOUND]: ErrorCode.NOT_FOUND,
	[Message.NOT_AUTHENTICATED]: ErrorCode.UNAUTHENTICATED,
	[Message.TOKEN_NOT_EXIST]: ErrorCode.UNAUTHENTICATED,
	[Message.ONLY_SPECIFIC_ROLES_ALLOWED]: ErrorCode.FORBIDDEN,
	[Message.NOT_ALLOWED_REQUEST]: ErrorCode.FORBIDDEN,
	[Message.NOT_YOUR_ORDER]: ErrorCode.FORBIDDEN,
	[Message.BLOCKED_USER]: ErrorCode.ACCOUNT_BLOCKED,
	[Message.USED_MEMBER_NICK_OR_PHONE]: ErrorCode.CONFLICT,
	[Message.SELF_SUBSCRIPTION_DENIED]: ErrorCode.CONFLICT,
	[Message.PROVIDE_ALLOWED_FORMAT]: ErrorCode.INVALID_FILE_TYPE,
	[Message.PROVIDE_ALLOWED_MODEL_FORMAT]: ErrorCode.INVALID_FILE_TYPE,
	[Message.INSUFFICIENT_STOCK]: 'INSUFFICIENT_STOCK',
	[Message.INVALID_ORDER_TRANSITION]: 'INVALID_ORDER_TRANSITION',
	[Message.INVALID_INSTALLATION_DATE]: 'INVALID_INSTALLATION_DATE',
};

export enum Direction {
	ASC = 1,
	DESC = -1,
}
registerEnumType(Direction, {
	name: 'Direction',
});

class Errors extends Error {
	public code: HttpCode;
	public message: Message;

	static standard = {
		code: HttpCode.INTERNAL_SERVER_ERROR,
		message: Message.SOMETHING_WENT_WRONG,
	};

	constructor(statusCode: HttpCode, statusMessage: Message) {
		super();
		this.code = statusCode;
		this.message = statusMessage;
	}
}

export default Errors;
