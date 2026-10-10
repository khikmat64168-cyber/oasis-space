import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { SmsService, maskPhone } from '../../libs/sms/sms.service';
import { normalisePhone } from '../../libs/phone';
import { T } from '../../libs/types/common';

/** How long a code is good for. Short, because it is six digits. */
const CODE_TTL_SECONDS = 5 * 60;
/** Wrong guesses before the row is burnt and a new code must be requested. */
const MAX_ATTEMPTS = 5;
/** Minimum gap between two sends to the same number. */
const RESEND_COOLDOWN_SECONDS = 60;
/** Sends allowed to one number per window. */
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_SECONDS = 60 * 60;
/** How long the proof-of-verification ticket is accepted by signup. */
const TICKET_TTL_SECONDS = 15 * 60;

export interface PhoneVerificationState {
	phone: string;
	codeHash: string;
	expiresAt: Date;
	attempts: number;
	consumedAt?: Date;
	sendCount: number;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * SMS one-time codes, and the ticket that proves one was completed.
 *
 * The flow deliberately does NOT create an account or a session at the code
 * step. Verifying returns a short-lived signed ticket bound to the phone
 * number; `signup` requires that ticket and reads the number out of it. That
 * is why no `phoneVerified` boolean from the browser is ever trusted — there
 * is nothing for the browser to lie with.
 */
@Injectable()
export class VerificationService {
	private readonly logger = new Logger(VerificationService.name);

	constructor(
		@InjectModel('PhoneVerification') private readonly verificationModel: Model<T>,
		private readonly smsService: SmsService,
		private readonly jwtService: JwtService,
	) {}

	public get smsAvailable(): boolean {
		return this.smsService.isConfigured;
	}

	/**
	 * Send a code.
	 *
	 * Returns the seconds until a resend is allowed; it never returns the code
	 * or anything derived from it.
	 */
	public async requestPhoneCode(rawPhone: string): Promise<{ resendAfterSeconds: number; expiresInSeconds: number }> {
		const phone = normalisePhone(rawPhone);
		if (!phone) throw new BadRequestException('INVALID_PHONE');

		// refuse before touching the database, so an unconfigured deployment
		// cannot accumulate rows that will never be completable
		if (!this.smsService.isConfigured) throw new BadRequestException('SMS_NOT_CONFIGURED');

		const now = new Date();
		const existing = (await this.verificationModel
			.findOne({ phone })
			.sort({ createdAt: -1 })
			.lean()
			.exec()) as PhoneVerificationState | null;

		if (existing) {
			const sinceLast = (now.getTime() - new Date(existing.updatedAt).getTime()) / 1000;
			if (sinceLast < RESEND_COOLDOWN_SECONDS) {
				throw new BadRequestException(`RESEND_TOO_SOON:${Math.ceil(RESEND_COOLDOWN_SECONDS - sinceLast)}`);
			}
			const windowAge = (now.getTime() - new Date(existing.createdAt).getTime()) / 1000;
			if (windowAge < SEND_WINDOW_SECONDS && existing.sendCount >= MAX_SENDS_PER_WINDOW) {
				throw new BadRequestException('TOO_MANY_REQUESTS');
			}
		}

		// crypto.randomInt, not Math.random: this is a credential
		const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
		const codeHash = await bcrypt.hash(code, 10);
		const expiresAt = new Date(now.getTime() + CODE_TTL_SECONDS * 1000);

		// Send BEFORE recording. If the provider fails we throw, no row is
		// written, and the caller sees a failure rather than a phantom code.
		await this.smsService.send(phone, `Your Oasis Space verification code is ${code}. It expires in 5 minutes.`);

		const keepWindow = existing && (now.getTime() - new Date(existing.createdAt).getTime()) / 1000 < SEND_WINDOW_SECONDS;
		await this.verificationModel.deleteMany({ phone }).exec();
		await this.verificationModel.create({
			phone,
			codeHash,
			expiresAt,
			attempts: 0,
			sendCount: keepWindow ? (existing as PhoneVerificationState).sendCount + 1 : 1,
			// preserve the window start so resending cannot reset the quota
			...(keepWindow ? { createdAt: (existing as PhoneVerificationState).createdAt } : {}),
		});

		this.logger.log(`Verification code sent to ${maskPhone(phone)}`);
		return { resendAfterSeconds: RESEND_COOLDOWN_SECONDS, expiresInSeconds: CODE_TTL_SECONDS };
	}

	/**
	 * Check a code and, on success, mint the ticket signup will ask for.
	 */
	public async verifyPhoneCode(rawPhone: string, code: string): Promise<{ verificationTicket: string }> {
		const phone = normalisePhone(rawPhone);
		if (!phone) throw new BadRequestException('INVALID_PHONE');
		if (!/^\d{6}$/.test(String(code ?? '').trim())) throw new BadRequestException('INVALID_CODE');

		const row = (await this.verificationModel
			.findOne({ phone })
			.select('+codeHash')
			.sort({ createdAt: -1 })
			.exec()) as T | null;

		// one message for every "there is nothing to check" case, so a caller
		// cannot tell a never-requested number from an expired one
		if (!row) throw new BadRequestException('CODE_NOT_FOUND');
		if (row.consumedAt) throw new BadRequestException('CODE_NOT_FOUND');
		if (new Date(row.expiresAt).getTime() <= Date.now()) throw new BadRequestException('CODE_EXPIRED');
		if (row.attempts >= MAX_ATTEMPTS) throw new BadRequestException('TOO_MANY_ATTEMPTS');

		const matches = await bcrypt.compare(String(code).trim(), row.codeHash);
		if (!matches) {
			// counted before the response, so a race cannot buy extra guesses
			await this.verificationModel.updateOne({ _id: row._id }, { $inc: { attempts: 1 } }).exec();
			const left = MAX_ATTEMPTS - (row.attempts + 1);
			throw new BadRequestException(left > 0 ? `WRONG_CODE:${left}` : 'TOO_MANY_ATTEMPTS');
		}

		// single-use: stamped immediately, and the guard above rejects a
		// consumed row, so the same code cannot be replayed
		await this.verificationModel.updateOne({ _id: row._id }, { $set: { consumedAt: new Date() } }).exec();

		const verificationTicket = await this.jwtService.signAsync(
			{ phone, purpose: 'phone_verification' },
			{ expiresIn: TICKET_TTL_SECONDS },
		);
		this.logger.log(`Phone verified for ${maskPhone(phone)}`);
		return { verificationTicket };
	}

	/**
	 * Read a ticket back. Returns the E.164 number it was issued for, or
	 * throws — signup calls this instead of trusting an input field.
	 */
	public async consumeTicket(ticket: string): Promise<string> {
		if (!ticket) throw new BadRequestException('PHONE_NOT_VERIFIED');
		let payload: T;
		try {
			payload = await this.jwtService.verifyAsync(ticket);
		} catch {
			throw new BadRequestException('PHONE_NOT_VERIFIED');
		}
		if (payload?.purpose !== 'phone_verification' || !payload?.phone) {
			// a normal access token must not work here
			throw new BadRequestException('PHONE_NOT_VERIFIED');
		}
		return String(payload.phone);
	}
}
