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
import { register } from 'module';

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
	PROVIDE_ALLOWED_FORMAT = 'Please provide jpg, jpeg or png images!',
	SELF_SUBSCRIPTION_DENIED = 'Self subscription is denied!',
}

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
