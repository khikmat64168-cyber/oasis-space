# OASIS SPACE — API

Premium botanical marketplace. This repository is the **backend** only; the
client lives in a separate repository (`~/Desktop/oasis-demo`, Next.js) and has
its own `CLAUDE.md`.

NestJS monorepo:

```
apps/oasis-api/     GraphQL API        → port 3013   npm run start:dev
apps/oasis-batch/   scheduled jobs                   npm run start:dev:batch
```

MongoDB Atlas, database **`Oasis`**. Playground at `http://localhost:3013/graphql`.

---

## Non-negotiables

**Never run `git commit` or `git push`.** The user commits manually. Provide
the commands for them to run instead.

**Never invent schema.** Before adding or using a field, read the actual
`schema/*.model.ts`, the DTO under `libs/dto/`, the resolver and the service —
then check which client queries select it. The frontend hand-writes its types
(no codegen), so a schema change that is not announced silently breaks it.

**Never fabricate data.** No seeded users, orders, statistics or notifications
unless explicitly asked for as isolated demo data.

**Do not swallow exceptions and do not return a fake success.** This has
already bitten us: `imagesUploader` caught each file's error, logged it and
returned a shorter list, so an unsupported format looked like the button simply
did nothing.

---

## Stack (verified in package.json)

| | |
|---|---|
| Framework | **NestJS 10** (not bare Express — `@nestjs/platform-express` is the adapter) |
| GraphQL | `@nestjs/graphql` 12 + `@nestjs/apollo` 12 + `@apollo/server` 4, **code-first** (`autoSchemaFile: true`) |
| Database | MongoDB via `@nestjs/mongoose` 10 / `mongoose` 8 |
| Auth | `@nestjs/jwt`, `bcryptjs` |
| Validation | `class-validator` + `class-transformer`, global `ValidationPipe` |
| Uploads | `graphql-upload` 13 via `graphqlUploadExpress` |
| Realtime | `ws` + `@nestjs/platform-ws` |
| Tests | Jest + ts-jest — `npm test` |

The schema is **generated from the decorators**. There is no `.graphql` file to
edit; change the DTO and the schema follows.

---

## Domain truths

These are the facts most often got wrong. Check here before assuming.

### Roles

**CLIENT / AGENT / ADMIN** (`MemberType`) — never USER, CUSTOMER or SELLER.
There is exactly **one** ADMIN account.

Enforcement is `@Roles(...)` + `RolesGuard`; `AuthGuard` for merely
authenticated; `WithoutGuard` for public queries that still want an optional
member id.

### Order lifecycle

```
PENDING → CONFIRMED → IN_TRANSIT → INSTALLED        (+ CANCELLED from several)
```

**There is no `DELIVERED` status.** `INSTALLED` is the terminal success state;
"sold" means INSTALLED. Rejection is not a status either — it is derived:
an AGENT moving their own order out of `PENDING` to CANCELLED.

`getOrder` is readable only by the owning CLIENT and an ADMIN. An AGENT reading
a single order by id is forbidden by design.

### Notifications

Nine live types, all order-related. `ORDER_PLACED` and `ORDER_STATUS_CHANGED`
are kept as `@deprecated` members because 12 live rows still reference them —
do not delete them.

Fields are `receiverId`, `notificationStatus`, `notificationType` (not
`recipientId` / `isRead` / `type`).

There is **no payment, invoice or inventory-alert backend**, and messaging is a
single shared public socket room with no recipient addressing. Do not agree to
build notifications on top of any of those without saying what is missing
first. `~/Desktop/oasis-demo/docs/notifications-phase1-audit.md` records why
~28 of ~40 requested types were excluded.

### Uploads

`member.resolver.ts` holds all three uploaders:

| Mutation | Accepts | Targets | Guard |
|---|---|---|---|
| `imageUploader` | `.png .jpg .jpeg .webp` | member, plant, accessory, article | `AuthGuard` |
| `imagesUploader` | same | same | `AuthGuard` |
| `modelUploader` | `.glb .gltf` | plant only | `@Roles(AGENT, ADMIN)` |

`isValidImage` accepts on mimetype **or** extension. `isValidModel` requires
the **extension**, deliberately: most browsers report `.glb` as
`application/octet-stream`, so trusting the mimetype would admit any binary.

`target` is checked against a fixed list — this is what blocks path traversal.
Stored names are regenerated as a UUID, so a client filename never reaches the
filesystem. Ceiling: 15MB per file, 10 files per request
(`graphqlUploadExpress` in `main.ts`). Files are served from `/uploads`.

### Validation traps

- `BAISearch` has **no** `articleStatus` field.
- `AISearch.text` is `@IsNotEmpty()`, so `search: {}` fails.
- `AgentsInquiry.sort` is whitelisted to `createdAt`, `updatedAt`,
  `memberLikes`, `memberViews`, `memberRank` — anything else is rejected.

Sort whitelists live in `libs/config.ts` (`availablePlantSorts` and friends).

---

## Layout

```
apps/oasis-api/src/
  components/<domain>/   resolver + service + module (+ *.spec.ts)
  libs/dto/<domain>/     @ObjectType / @InputType — the GraphQL schema
  libs/enums/            MemberType, OrderStatus, PlantStatus, NotificationType…
  libs/config.ts         sort whitelists, upload validation, shared aggregations
  libs/Errors.ts         Message enum — user-facing error strings
  schema/*.model.ts      mongoose schemas
```

A new domain module must be registered in `components/components.module.ts`.

---

## Working method

1. Read before writing: model → DTO → resolver → service → client consumers.
2. Reuse the existing validation, guard and error conventions. Do not start a
   second system alongside one that already works.
3. Backend is authoritative for roles, ownership, prices, stock, order state
   and identity. Never trust any of these from the client.
4. Watch for N+1 lookups and unbounded queries; paginate list endpoints.
5. Never log secrets; never return stack traces.
6. Verify:
   ```bash
   npx tsc --noEmit -p apps/oasis-api/tsconfig.app.json
   npm test
   ```
   Then prove the behaviour over HTTP — a passing unit test does not show that
   the guard, the validation pipe and the schema agree:
   ```bash
   curl -s localhost:3013/graphql -H 'Content-Type: application/json' \
     -d '{"query":"{__type(name:\"Mutation\"){fields{name}}}"}'
   ```
   Test the **refusal** paths too — wrong role, bad format, bad target — not
   just the happy path. Delete any file you upload while testing.
7. Report honestly: what changed, what was reused, what is new, what you
   tested, and what is still open. If something is unverified, say which part.
