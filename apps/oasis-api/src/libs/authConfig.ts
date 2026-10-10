import { CookieOptions, Request } from 'express';

/**
 * Authentication settings, in one place, read from the environment.
 *
 * Everything here is validated at startup by assertAuthConfig() so a missing
 * or nonsensical value fails the boot rather than silently weakening a
 * security control at request time.
 */

/** Short by design: the refresh token is what carries the session. */
export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL ?? '15m';

/** How long a login chain may live without the member signing in again. */
export const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);

export const REFRESH_COOKIE_NAME = 'oasis_rt';

/**
 * The cookie is confined to the two endpoints that read it. A bug anywhere
 * else in the API therefore cannot see it, and neither can the GraphQL
 * endpoint — which matters, because GraphQL is the surface most exposed to
 * crafted input.
 */
export const REFRESH_COOKIE_PATH = '/auth';

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Origins allowed to make credentialed requests.
 *
 * `enableCors({ origin: true })` reflects whatever Origin the caller sends and
 * was previously paired with `credentials: true` — with a cookie in play that
 * combination lets any site on the internet make authenticated requests as the
 * signed-in user. An explicit list is the fix.
 */
export const allowedOrigins = (): string[] =>
	(process.env.CORS_ORIGINS ?? 'http://localhost:3011')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

/**
 * Cookie attributes.
 *
 * SameSite=Lax is enough here because the frontend and the API are the same
 * site: in production they sit under one registrable domain (oasis.space and
 * api.oasis.space, with COOKIE_DOMAIN=.oasis.space), and in development they
 * are localhost:3011 and localhost:3013 — cookies ignore the port, so those
 * are same-site too. Lax then means the browser itself refuses to attach the
 * cookie to a cross-site POST, which is the CSRF defence; the Origin check in
 * the controller backs it up.
 *
 * Secure is on in production and off in development, because a Secure cookie
 * is not stored over plain http://. That is an environment difference, not a
 * weakening of the production policy.
 */
export const refreshCookieOptions = (): CookieOptions => ({
	httpOnly: true,
	secure: isProduction(),
	sameSite: 'lax',
	path: REFRESH_COOKIE_PATH,
	maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
	...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
});

/**
 * Clearing must repeat path and domain exactly — a Set-Cookie whose attributes
 * do not match leaves the original cookie in place and the "logout" is a lie.
 */
export const clearRefreshCookieOptions = (): CookieOptions => {
	const { maxAge, ...rest } = refreshCookieOptions();
	return rest;
};

/** Fail the boot rather than run with a broken security setting. */
export const assertAuthConfig = (): void => {
	const problems: string[] = [];

	if (!process.env.SECRET_TOKEN) problems.push('SECRET_TOKEN is not set');
	if (!Number.isFinite(REFRESH_TOKEN_TTL_DAYS) || REFRESH_TOKEN_TTL_DAYS <= 0) {
		problems.push('REFRESH_TOKEN_TTL_DAYS must be a positive number');
	}
	if (isProduction()) {
		if (!process.env.CORS_ORIGINS) problems.push('CORS_ORIGINS must be set in production');
		if (allowedOrigins().some((origin) => origin.startsWith('http://'))) {
			problems.push('CORS_ORIGINS contains a plaintext http:// origin in production');
		}
	}

	if (problems.length) {
		throw new Error(`Auth configuration is invalid:\n  - ${problems.join('\n  - ')}`);
	}
};

/**
 * Read one cookie off the raw header.
 *
 * Express serves `res.cookie()` natively, but `req.cookies` needs the
 * cookie-parser middleware. Pulling in a dependency to read a single
 * known-named cookie is not worth it, so this does the one thing needed.
 * Values are percent-encoded by `res.cookie`, hence the decode.
 */
export const readCookie = (req: Request, name: string): string | undefined => {
	const header = req.headers?.cookie;
	if (!header) return undefined;

	for (const part of header.split(';')) {
		const index = part.indexOf('=');
		if (index < 0) continue;
		if (part.slice(0, index).trim() !== name) continue;
		const raw = part.slice(index + 1).trim();
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	}
	return undefined;
};
