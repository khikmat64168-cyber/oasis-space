# Refresh-token authentication

Built 2026-10-11. API side in this repository; client side in
`~/Desktop/oasis-demo` (`libs/auth/refresh.ts`, `apollo/client.ts`).

---

## 1. What was there before

One JWT, signed with `SECRET_TOKEN`, **valid for 30 days**, kept in
`localStorage`, sent as `Authorization: Bearer`. No session store, no refresh,
no cookie.

The problems that mattered, in order of severity:

| | |
|---|---|
| **No revocation at all** | `logOut()` did `localStorage.removeItem` and reloaded the page. The token stayed valid server-side for the rest of its month. |
| **Guards never re-read the member** | `AuthGuard` and `RolesGuard` only verified the signature, so a member blocked or deleted *after* signing in kept full access, and a role change did not take effect. |
| **30-day token in localStorage** | Anything that could read it owned the account for a month. |
| **Refresh link was a decoy** | `apollo-link-token-refresh` was wired in with `isTokenValidOrUndefined: () => true` and `fetchAccessToken: () => null`. It never did anything. |
| **CORS reflected any origin with credentials** | `enableCors({ origin: true, credentials: true })`. Harmless only because there was no cookie; adding one would have made it an account-takeover path. |
| **Auth errors were indistinguishable** | An expired token surfaced as `INTERNAL_SERVER_ERROR: "jwt expired"`, so no client could tell "refresh me" from "the server broke". |

---

## 2. Design

**Access token** — unchanged in shape, `15m` instead of `30d`
(`ACCESS_TOKEN_TTL`). The claim set was deliberately left alone: the client
decodes it to populate `userVar`, and slimming it would have broken the UI for
no security gain now that the guards treat the stored record as authoritative.

**Refresh token** — 32 bytes from `crypto.randomBytes`, base64url, opaque. Only
`sha256(token)` is stored. SHA-256 rather than bcrypt because the token is
256 bits of CSPRNG output (nothing to brute-force) and because the hash has to
be the indexed lookup key, which a per-row bcrypt salt makes impossible.

**Delivery** — `HttpOnly`, `SameSite=Lax`, `Path=/auth`, `Secure` in
production, `Domain` from `COOKIE_DOMAIN`. Lax is sufficient because the
frontend and API are the same site in both environments: `oasis.space` /
`api.oasis.space` under `.oasis.space` in production, and `localhost:3011` /
`localhost:3013` in development — cookies ignore the port. The browser
therefore refuses to attach the cookie to a cross-site POST, which is the CSRF
defence; the `Origin` check in `AuthController` backs it up.

`Path=/auth` keeps the cookie away from `/graphql`, which is the surface most
exposed to crafted input.

---

## 3. Rotation and reuse

Rotation is one atomic `findOneAndUpdate`:

```ts
{ tokenHash, revokedAt: null, expiresAt: { $gt: now } } → { revokedAt, revokedReason: 'ROTATED' }
```

Of two requests presenting the same token, exactly one matches an open row.
That is what makes concurrent refreshes safe **without a transaction** — Atlas
would support one (`atlas-i5k97x-shard-0`, verified), but a single atomic
update is simpler and has fewer failure modes. The check and the write must
stay in one statement; splitting them reintroduces the race.

A token that is known but already closed means the plaintext existed in two
places. Which holder is presenting it cannot be determined, so **that family**
is revoked — one login chain, not the member's other devices, which have their
own families and tell us nothing.

Every rejection returns the same `REFRESH_REJECTED`, so the response does not
say whether a token was unknown, expired or replayed.

---

## 4. Endpoints

`POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all` — Express,
not GraphQL. GraphQL is a single `POST /graphql`, so a cookie scoped tightly
enough to be worth scoping would have to be readable by every operation in the
schema. None of the three accepts a token in a body or a URL; the cookie is the
only input.

`AuthController` lives in `MemberModule` rather than `AuthModule` because it
needs `MemberService`, and `MemberModule` already imports `AuthModule`.

Refresh re-reads the member (`getMemberForSession`) before minting a token, so
holding a valid refresh cookie does not survive the account being blocked or
deleted.

Rate limit: 30 requests/minute per address, in-memory, same shape as the
assistant's. No new dependency.

---

## 5. Client

`refreshAccessToken()` is **single-flight**. This is not an optimisation: six
queries failing together would otherwise send six refreshes, five of which
present a token the first already rotated — which the server correctly reads as
reuse and answers by revoking the family. Without the guard, concurrency would
log the user out.

`onError` triggers a refresh on exactly one message, `ACCESS_TOKEN_EXPIRED`.
Authorization refusals, validation errors, business-rule errors and network
faults are left alone, because refreshing cannot fix them. Each operation
retries at most once, tracked on the operation's own context — per-request, so
nothing leaks between operations and the loop is bounded.

`restoreSession()` runs on mount in each layout: it uses the stored access
token when it is still usable (expiry checked client-side with a 30s skew),
and otherwise rebuilds from the refresh cookie. Reactive vars do not survive a
reload; the cookie does.

`logOut()` now calls `POST /auth/logout` **before** clearing local state. The
old implementation revoked nothing.

---

## 6. New dependency: none

`cookie-parser` would be the obvious addition, but only one cookie with a known
name has to be read, so `readCookie()` in `libs/authConfig.ts` does it in ten
lines. `res.cookie()` is native to Express and needs no middleware.

---

## 7. Migration and deployment

No migration script. `refreshsessions` is a new collection created on first
write; nothing existing is altered or dropped.

Existing 30-day access tokens keep working until they expire. Those holders
have no refresh cookie, so when their token finally expires they sign in again
once. No forced logout.

Set before deploying:

```bash
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL_DAYS=30
CORS_ORIGINS=https://oasis.space       # required in production
COOKIE_DOMAIN=.oasis.space             # production only
```

`assertAuthConfig()` fails the boot on a missing `SECRET_TOKEN`, a missing
`CORS_ORIGINS` in production, or a plaintext `http://` origin in production.

Indexes are declared on the schema and built by Mongoose on first use:
unique `tokenHash`, TTL on `expiresAt`, plus `memberId+revokedAt` and
`familyId+revokedAt`. The TTL monitor runs about once a minute, so expiry is
also checked in code — an expired row must never be honoured in that window.

---

## 8. Tests

29 in `auth.service.spec.ts` and `refresh.service.spec.ts`; 167 pass across the
API. They cover rotation, family reuse revocation, two concurrent rotations
resolving to one winner, expiry, revocation, logout-then-refresh, that no
plaintext token is stored, that an expired token is reported distinctly from an
invalid one, that a blocked or deleted member is refused, and that the live
member lookup is cached rather than run per request.

Verified over HTTP against the running API: refresh with no cookie → 401;
with a forged cookie → 401 `REFRESH_REJECTED`; from `https://evil.example` →
403 with no `Access-Control-Allow-Origin`; from `http://localhost:3011` → ACAO
present; 31st refresh in a minute → 429; logout with no cookie → 200.

**Not verified end to end: the full login → cookie → rotate → reuse cycle
against the live server.** That needs a real account, and no disposable one was
created. The same path is covered by the unit tests against a fake whose
`findOneAndUpdate` is faithful to the atomic semantics the logic depends on.

**No frontend tests exist in the client repository** — there is no test runner
configured there, so the Apollo retry/single-flight behaviour is reasoned about
and reviewed but not executed under test.

---

## 9. Known limitations

**The rate limit is per process.** In-memory, so it does not span instances.

**No "your sessions" screen.** `userAgent` is recorded for one, but nothing
renders it yet.

**Password change does not revoke sessions.** `revokeAllForMember` exists and
is wired to `logout-all`, but no password-change flow calls it, because the
project has no password-change mutation yet.

**The WebSocket still passes the access token in the URL query string**
(`apollo/client.ts`), where it can land in proxy and server logs. Out of scope
here; it needs the socket handshake moved to a header or a short-lived ticket.
