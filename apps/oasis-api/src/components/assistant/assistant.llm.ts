import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

/**
 * The language model, behind one adapter.
 *
 * The project had no provider, so this reads an Oasis-controlled key from the
 * environment and refuses to run without one. It does NOT fall back to a
 * canned sentence dressed up as a generated answer — when the key is absent
 * the service answers from the retrieved records directly and marks the reply
 * `generated: false`, so a reader is never told a model wrote something it
 * did not.
 *
 * Nothing Lovable-related is used: no gateway URL, no LOVABLE_API_KEY, no
 * provider-specific headers. The key never leaves this process.
 */

/** hard ceilings, independent of anything a caller or prompt asks for */
const MAX_OUTPUT_TOKENS = 400;
const REQUEST_TIMEOUT_MS = 20_000;

export interface GenerationRequest {
	system: string;
	user: string;
}

@Injectable()
export class AssistantLlm {
	private readonly logger = new Logger(AssistantLlm.name);

	private readonly apiKey = process.env.OPENAI_API_KEY?.trim() || '';
	private readonly model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

	public get isConfigured(): boolean {
		return this.apiKey.length > 0;
	}

	public get missingConfig(): string {
		return 'OPENAI_API_KEY is not set';
	}

	/**
	 * One completion. Throws on anything other than a usable answer — the
	 * caller degrades to the structured reply rather than showing an error.
	 */
	public async generate({ system, user }: GenerationRequest): Promise<string> {
		if (!this.isConfigured) throw new InternalServerErrorException('LLM_NOT_CONFIGURED');

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const res = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				signal: controller.signal,
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: this.model,
					max_tokens: MAX_OUTPUT_TOKENS,
					temperature: 0.2,
					messages: [
						{ role: 'system', content: system },
						{ role: 'user', content: user },
					],
				}),
			});

			if (!res.ok) {
				// the body can echo the prompt, which carries retrieved content;
				// log the status alone
				this.logger.error(`Model provider rejected the request (HTTP ${res.status})`);
				throw new InternalServerErrorException('LLM_REQUEST_FAILED');
			}

			const json: any = await res.json();
			const text = json?.choices?.[0]?.message?.content;
			if (typeof text !== 'string' || !text.trim()) throw new InternalServerErrorException('LLM_EMPTY_RESPONSE');

			// usage only — never the prompt or the completion
			const usage = json?.usage;
			if (usage) {
				this.logger.log(`assistant completion: ${usage.prompt_tokens}+${usage.completion_tokens} tokens`);
			}
			return text.trim();
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				this.logger.warn('Model provider timed out');
				throw new InternalServerErrorException('LLM_TIMEOUT');
			}
			throw err;
		} finally {
			clearTimeout(timer);
		}
	}
}
