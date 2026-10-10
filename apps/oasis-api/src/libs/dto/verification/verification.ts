import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class PhoneCodeRequestResult {
	/** seconds the caller must wait before asking for another code */
	@Field(() => Int)
	resendAfterSeconds!: number;

	/** seconds until the code sent now stops working */
	@Field(() => Int)
	expiresInSeconds!: number;
}

@ObjectType()
export class PhoneVerificationResult {
	/**
	 * Short-lived signed proof that this phone number completed verification.
	 * Signup requires it; it is not a session and grants nothing on its own.
	 */
	@Field(() => String)
	verificationTicket!: string;
}

@ObjectType()
export class AuthCapabilities {
	/** false when no SMS provider is configured — the UI hides the flow */
	@Field(() => Boolean)
	smsVerification!: boolean;

	@Field(() => Boolean)
	telegramLogin!: boolean;

	@Field(() => Boolean)
	facebookLogin!: boolean;

	/** public bot username, needed to render Telegram's own widget */
	@Field(() => String, { nullable: true })
	telegramBotName?: string;

	/** public app id; the secret never leaves the server */
	@Field(() => String, { nullable: true })
	facebookAppId?: string;
}
