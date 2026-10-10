import { Body, Controller, ForbiddenException, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
// `import type` is required: isolatedModules + emitDecoratorMetadata would
// otherwise try to emit these interfaces as runtime values
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RefreshService, REFRESH_REJECTED } from './refresh.service';
import { MemberService } from '../member/member.service';
import {
	REFRESH_COOKIE_NAME,
	allowedOrigins,
	clearRefreshCookieOptions,
	readCookie,
	refreshCookieOptions,
} from '../../libs/authConfig';

/** Per-address limiter, same shape as the assistant's — no new dependency. */
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

const takeToken = (key: string): boolean => {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
		return true;
	}
	if (bucket.count >= MAX_PER_WINDOW) return false;
	bucket.count += 1;
	return true;
};

const sweep = () => {
	const now = Date.now();
	for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
};

/**
 * The refresh cookie lives on HTTP, not GraphQL.
 *
 * GraphQL is a single POST /graphql, so a cookie scoped tightly enough to be
 * useful would have to be readable by every query and mutation in the schema.
 * Two narrow endpoints under /auth keep the cookie's Path restrictive, which
 * is the point of setting a Path at all.
 *
 * Nothing here accepts a token in the body or the URL — only the cookie.
 */
@Controller('auth')
export class AuthController {
	constructor(
		private readonly authService: AuthService,
		private readonly refreshService: RefreshService,
		private readonly memberService: MemberService,
	) {}

	/**
	 * SameSite=Lax already stops a cross-site form or fetch from carrying the
	 * cookie. This is the second lock: a browser request that announces a
	 * foreign Origin is refused outright, which also covers the case of a
	 * future deployment loosening SameSite without revisiting this file.
	 *
	 * A request with no Origin at all (curl, a server-side call) is allowed
	 * through: those carry no ambient cookie and so are not the CSRF threat.
	 */
	private assertSameOrigin(req: Request): void {
		const origin = req.headers.origin;
		if (!origin) return;
		if (!allowedOrigins().includes(origin)) throw new ForbiddenException('ORIGIN_NOT_ALLOWED');
	}

	private clientKey(req: Request): string {
		const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
		return forwarded || req.ip || 'anon';
	}

	/**
	 * Exchange the refresh cookie for a fresh access token.
	 *
	 * Rotation, reuse detection and family revocation all happen inside
	 * RefreshService.rotate. What is added here is the account check: holding a
	 * valid refresh token must not survive the account being blocked or
	 * deleted, so the member is re-read before a new access token is minted.
	 */
	@Post('refresh')
	public async refresh(@Req() req: Request, @Res() res: Response) {
		this.assertSameOrigin(req);
		sweep();
		if (!takeToken(`rt:${this.clientKey(req)}`)) {
			return res.status(429).json({ message: 'TOO_MANY_REQUESTS' });
		}

		const presented = readCookie(req, REFRESH_COOKIE_NAME);
		if (!presented) return res.status(401).json({ message: REFRESH_REJECTED });

		try {
			const { memberId, next } = await this.refreshService.rotate(presented, req.headers['user-agent']);

			// a revoked token cannot be un-revoked, so if the account turns out
			// to be unusable the rotation we just performed simply ends the chain
			const member = await this.memberService.getMemberForSession(memberId);
			if (!member) {
				await this.refreshService.revokeAllForMember(memberId, 'ADMIN');
				res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
				return res.status(401).json({ message: REFRESH_REJECTED });
			}

			const accessToken = await this.authService.createToken(member);
			res.cookie(REFRESH_COOKIE_NAME, next.token, refreshCookieOptions());
			// the refresh token itself is never part of the body
			return res.status(200).json({ accessToken });
		} catch (err) {
			res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
			if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
				return res.status(401).json({ message: REFRESH_REJECTED });
			}
			console.error('[auth] refresh failed', err instanceof Error ? err.message : err);
			return res.status(401).json({ message: REFRESH_REJECTED });
		}
	}

	/**
	 * End this session. Safe to call repeatedly and safe to call with no
	 * cookie — logging out is never an error.
	 */
	@Post('logout')
	public async logout(@Req() req: Request, @Res() res: Response) {
		this.assertSameOrigin(req);

		const presented = readCookie(req, REFRESH_COOKIE_NAME);
		if (presented) await this.refreshService.revokeByToken(presented);

		res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
		return res.status(200).json({ ok: true });
	}

	/**
	 * Every device. The caller proves themselves with the refresh cookie
	 * rather than an access token, so a member whose access token has already
	 * expired can still pull the plug on a device they have lost.
	 */
	@Post('logout-all')
	public async logoutAll(@Req() req: Request, @Res() res: Response) {
		this.assertSameOrigin(req);

		const presented = readCookie(req, REFRESH_COOKIE_NAME);
		if (presented) {
			const owner = await this.refreshService.memberIdForToken(presented);
			if (owner) await this.refreshService.revokeAllForMember(owner);
		}

		res.clearCookie(REFRESH_COOKIE_NAME, clearRefreshCookieOptions());
		return res.status(200).json({ ok: true });
	}
}
