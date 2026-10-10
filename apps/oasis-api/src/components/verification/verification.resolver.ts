import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UsePipes, ValidationPipe } from '@nestjs/common';
import { VerificationService } from './verification.service';
import {
	AuthCapabilities,
	PhoneCodeRequestResult,
	PhoneVerificationResult,
} from '../../libs/dto/verification/verification';
import { PhoneCodeRequestInput, PhoneCodeVerifyInput } from '../../libs/dto/verification/verification.input';

/**
 * Phone verification, and the capability probe the sign-up page reads before
 * it decides what to render.
 *
 * All three are public: a visitor has no account yet, so there is nothing to
 * authenticate them with. The protection is in the service — rate limits,
 * cooldowns, attempt ceilings — not in a guard.
 */
@Resolver()
export class VerificationResolver {
	constructor(private readonly verificationService: VerificationService) {}

	/** What the server can actually do, so the UI never offers what it cannot. */
	@Query(() => AuthCapabilities)
	public async getAuthCapabilities(): Promise<AuthCapabilities> {
		return {
			smsVerification: this.verificationService.smsAvailable,
			telegramLogin: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_BOT_NAME,
			facebookLogin: !!process.env.FACEBOOK_APP_ID && !!process.env.FACEBOOK_APP_SECRET,
			// public identifiers only; the secrets stay here
			telegramBotName: process.env.TELEGRAM_BOT_NAME || undefined,
			facebookAppId: process.env.FACEBOOK_APP_ID || undefined,
		};
	}

	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Mutation(() => PhoneCodeRequestResult)
	public async requestPhoneCode(@Args('input') input: PhoneCodeRequestInput): Promise<PhoneCodeRequestResult> {
		console.log('Mutation: requestPhoneCode');
		return await this.verificationService.requestPhoneCode(input.phone);
	}

	@UsePipes(new ValidationPipe({ whitelist: true }))
	@Mutation(() => PhoneVerificationResult)
	public async verifyPhoneCode(@Args('input') input: PhoneCodeVerifyInput): Promise<PhoneVerificationResult> {
		console.log('Mutation: verifyPhoneCode');
		return await this.verificationService.verifyPhoneCode(input.phone, input.code);
	}
}
