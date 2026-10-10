import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

/**
 * SMS delivery.
 *
 * The project had no SMS provider, so this is a thin adapter rather than a
 * provider SDK: it reads credentials from the environment and refuses to run
 * without them.
 *
 * IT DOES NOT SIMULATE DELIVERY. When SMS_PROVIDER is unset, `isConfigured`
 * is false and `send` throws. Callers surface that as "phone verification is
 * not available", never as a sent code — an agent who thinks a code went out
 * and never arrives is worse off than one told the feature is switched off.
 *
 * Provider notes (checked against current public pricing, Oct 2026):
 *   - Twilio bills per outbound SMS; there is no free allowance beyond the
 *     trial credit, and trial accounts can only message verified numbers.
 *   - Korean providers (SOLAPI/CoolSMS, Aligo) are the usual choice for a
 *     +82 audience and are also per-message.
 * No provider delivers production SMS free, so this cannot be switched on
 * without a billable account. See docs/auth-upgrade.md.
 */
@Injectable()
export class SmsService {
	private readonly logger = new Logger(SmsService.name);

	/** 'twilio' | 'solapi' | undefined */
	private readonly provider = process.env.SMS_PROVIDER?.trim() || '';
	private readonly sender = process.env.SMS_SENDER?.trim() || '';

	public get isConfigured(): boolean {
		if (this.provider === 'twilio') {
			return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && this.sender);
		}
		if (this.provider === 'solapi') {
			return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && this.sender);
		}
		return false;
	}

	/** What is missing, for an operator reading the logs. Never the values. */
	public get missingConfig(): string {
		if (!this.provider) return 'SMS_PROVIDER is not set (expected "twilio" or "solapi")';
		if (this.provider === 'twilio') return 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and SMS_SENDER are required';
		if (this.provider === 'solapi') return 'SOLAPI_API_KEY, SOLAPI_API_SECRET and SMS_SENDER are required';
		return `Unknown SMS_PROVIDER "${this.provider}"`;
	}

	/**
	 * Deliver one message. Throws when unconfigured or when the provider
	 * rejects it — the caller must not record a code as sent on a throw.
	 */
	public async send(toE164: string, body: string): Promise<void> {
		if (!this.isConfigured) {
			// the number is logged, the body never is: it carries the code
			this.logger.warn(`SMS not sent to ${maskPhone(toE164)} — ${this.missingConfig}`);
			throw new InternalServerErrorException('SMS_NOT_CONFIGURED');
		}

		if (this.provider === 'twilio') return this.sendViaTwilio(toE164, body);
		if (this.provider === 'solapi') return this.sendViaSolapi(toE164, body);
		throw new InternalServerErrorException('SMS_NOT_CONFIGURED');
	}

	/**
	 * Twilio's Messages resource, called over plain HTTPS so the project does
	 * not take on an SDK for one endpoint.
	 */
	private async sendViaTwilio(to: string, body: string): Promise<void> {
		const sid = process.env.TWILIO_ACCOUNT_SID as string;
		const token = process.env.TWILIO_AUTH_TOKEN as string;
		const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({ To: to, From: this.sender, Body: body }).toString(),
		});
		if (!res.ok) {
			// provider errors can echo the request; log the status only
			this.logger.error(`Twilio rejected a message to ${maskPhone(to)} (HTTP ${res.status})`);
			throw new InternalServerErrorException('SMS_SEND_FAILED');
		}
	}

	/** SOLAPI (CoolSMS) simple message send. */
	private async sendViaSolapi(to: string, body: string): Promise<void> {
		const apiKey = process.env.SOLAPI_API_KEY as string;
		const apiSecret = process.env.SOLAPI_API_SECRET as string;
		const date = new Date().toISOString();
		const salt = Math.random().toString(36).slice(2);
		const crypto = await import('crypto');
		const signature = crypto.createHmac('sha256', apiSecret).update(date + salt).digest('hex');

		const res = await fetch('https://api.solapi.com/messages/v4/send', {
			method: 'POST',
			headers: {
				Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ message: { to: to.replace(/^\+82/, '0'), from: this.sender, text: body } }),
		});
		if (!res.ok) {
			this.logger.error(`SOLAPI rejected a message to ${maskPhone(to)} (HTTP ${res.status})`);
			throw new InternalServerErrorException('SMS_SEND_FAILED');
		}
	}
}

/** "+821012345678" -> "+8210****5678" — enough to correlate, not to dial */
export const maskPhone = (value: string): string =>
	value.length <= 8 ? '****' : `${value.slice(0, 6)}****${value.slice(-4)}`;
