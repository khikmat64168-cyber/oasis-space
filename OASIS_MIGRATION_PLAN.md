# OASIS — Migration Plan & Progress (Nestar → Oasis)

> Reference architecture: **Nestar** (NestJS + GraphQL Code-First + MongoDB monorepo).
> Target product: **Oasis** — plant marketplace + delivery/installation platform.
> Rule: preserve Nestar's architectural DNA, replace its real-estate domain.

## Resolved identity decisions
- **Brand = Oasis** everywhere (GraphQL, package name, DB name, docs, class/type naming). Domain stays plants: `Plant`, `Order`, `CLIENT`/`AGENT`/`ADMIN`.
- **App folders:** `apps/oasis-api`, `apps/oasis-batch`. Dead `apps/nestar` deleted.
- **DTOs flattened:** `libs/dto/plant/`, `libs/dto/order/`, `libs/dto/like/`, … (out of Nestar's `libs/dto/member/*` catch-all).
- **`supplyLocation`:** keep the Korean-city enum and **add more Korean cities**.
- **`socket` gateway:** kept, dormant, for future live order status.
- **Articles KEPT:** the community-board feature stays (agents post; clients like/view/comment). `CommentGroup = MEMBER | PLANT | ARTICLE`, likewise Like/View groups. So board-article is **adapted, not removed**.

---

## PROGRESS

### ✅ Phase 0 — Repository discovery (done)
Full assessment below (Part A).

### ✅ Phase 1 — Project identity & foundation (done)
- `apps/nestar-api → apps/oasis-api`, `apps/nestar-batch → apps/oasis-batch`; deleted dead `apps/nestar`.
- `nest-cli.json`, `package.json` (name `nestars → oasis`, all scripts + dist paths), both `tsconfig.app.json` outDirs updated.
- Batch cross-imports repointed `apps/nestar-api/src → apps/oasis-api/src`.
- Identity strings: API + BATCH hello messages → Oasis. `.env` DB `Nestar → Oasis` (dev+prod).
- Removed two broken default batch scaffold specs; fixed the API e2e scaffold (bad `supertest/types` import + hello assertion).
- **Verified:** `nest build oasis-api` ✅, `nest build oasis-batch` ✅, `tsc --noEmit` clean ✅, API boots + Mongo connects to `Oasis` + GraphQL `{ sayHello }` returns ✅.
- **Not yet done (by design):** domain still speaks real-estate (`Property`, `MemberType.USER`) — that's Phase 2/3.

### ⏭ Next: Phase 2 — Member + auth (`MemberType.USER → CLIENT`)

---

## PART A — REPOSITORY ASSESSMENT (Nestar baseline)

### 1. Architecture
NestJS monorepo. Apps: `oasis-api` (GraphQL API), `oasis-batch` (cron ranking). Stack: NestJS 10, `@nestjs/graphql` 12 + Apollo 4 (code-first, `autoSchemaFile`), Mongoose 8, JWT, bcryptjs, graphql-upload, moment, WS adapter + socket gateway. Ports: API 3008, batch 3007. **No top-level `libs/`** — shared code at `apps/oasis-api/src/libs/**`; the batch app cross-imports API source by path.

### 2. Bootstrap
`main.ts`: global `ValidationPipe`, `LoggingInterceptor`, CORS, `graphqlUploadExpress`, `WsAdapter`, static `/uploads`, EADDRINUSE retry. `app.module.ts`: `ConfigModule`, `GraphQLModule.forRoot` (playground, autoSchemaFile, custom formatError), `ComponentsModule`, `DatabaseModule`, `SocketModule`.

### 3. Modules (`components/`)
`auth`, `member`, `property`, `board-article`, `comment` (+ `comments` module), `like`, `view`, `follow`.

### 4. Database (raw Mongoose schemas)
`Member`, `Property`, `BoardArticle`, `Comment`, `Like`, `Follow`, `View`, `Notice`, `Notification`. Uniqueness: `Like{memberId,likeRefId}`, `View{memberId,viewRefId}`, `Follow{followingId,followerId}`, `Member.memberPhone/memberNick`, `Property{type,location,title,price}`. `Notice`/`Notification` have models+enums but **no wiring** (dead).

### 5. Authentication
`AuthService`: bcrypt hash/compare; `createToken` signs full member doc; `verifyToken`. `JwtModule` secret `SECRET_TOKEN`, 30d. Guards attach `request.body.authMember`; `@AuthMember('_id')` reads it.

### 6. GraphQL
Code-first, thin resolvers → services. List pattern everywhere: `$match → $sort → $facet{ list:[$skip,$limit,…lookups], metaCounter:[$count] }` → `{ list, metaCounter:[{total}] }`. Personalization via `lookupAuthMemberLiked`/`lookupAuthMemberFollowed` (`$lookup+let+pipeline+$expr`), no N+1.

### 7. DTO conventions
`*.ts` (`@ObjectType`), `*.input.ts` (create + `*Inquiry`), `*.update.ts` (optional except `_id`). `nullable:true` paired with `@IsOptional()`. Sort whitelists in `libs/config.ts`. (Nestar nests all DTOs under `dto/member/` — we flatten in Oasis.)

### 8. Guards
`AuthGuard` (required), `WithoutGuard` (optional token → public listings), `RolesGuard` + `@Roles(MemberType.X)`.

### 9. Social layer (reusable)
`Like.toggleLike` (+1/−1), `checkLikeExistence`, favorites. `View.recordView` (unique), visited. `Follow` subscribe/unsubscribe (self denied) + followers/followings with meLiked/meFollowed. `Comment` per-group stat routing. Central stats via `memberStatsEditor`/`propertyStatsEditor` (`$inc`).

### 10. Batch
`@Cron` → rollback + top-properties (`rank=likes*2+views*1`) + top-agents (`rank=properties*4+articles*3+likes*2+views*1`). Cross-imports API schemas.

### 11. Reusable keepers
`libs/config.ts` (aggregation helpers, `shapeIntoMongoObjectId`, image utils), `libs/Errors.ts` (`HttpCode`/`Message`/`Direction`), `libs/types/common.ts` (`T`, `StatisticModifier`), guards/decorators, `LoggingInterceptor`, `$facet` pagination + meLiked lookups, image upload mutations.

### 12. Real-estate to TRANSFORM / REMOVE
- **Transform → Plant:** `Property` model, `property.enum`, property DTOs, property component, `propertyBarter/Rent`, `availableOptions/availablePropertySorts`, `member.memberProperties`, `PROPERTY` group members → `PLANT`.
- **Remove:** ✅ dead `apps/nestar`; dead `Notice`/`Notification` (models+enums) — remove in Phase 10.
- **Keep (per decision):** `board-article` (adapt), `socket` (dormant).

### 13. ADAPT (pattern kept, logic rewritten)
`member` (`USER→CLIENT`, `memberProperties→memberPlants`), `auth` (verbatim), `like`/`view`/`follow`/`comment` (`PROPERTY→PLANT`, keep `ARTICLE`), `board-article` (already domain-neutral), batch (rename + bug fixes + plant formula), pagination/aggregation helpers.

### 14. CREATE from scratch
- **`order`** domain (schema, DTOs, `OrderStatus` enum, module, service with state machine + ownership, resolver).
- **`plantCategory`** second classification axis.
- **`deliveryRadius`** + `supplyLocation` distinction; `plantHeight` + `potSize`.

### 15. Risks & pre-existing bugs (fix during migration, don't carry over)
1. Batch↔API path coupling — handled in Phase 1 (renamed together).
2. DTO flattening touches many import paths (Phase 3+).
3. `autoSchemaFile:true` surfaces nullable/validator mismatches at boot — verify each DTO.
4. **Live secrets in `.env`** (real Atlas creds, weak `SECRET_TOKEN`) — gitignored; **rotate** + keep off git.
5. `batch.controller`: `batchRollback()` calls `batchTopProperties()`; `batchAgents()` calls `batchTopProperties()` — fix in Phase 7.
6. `member.service.getAllMembersByAdmin`: `match.MemberStatus` (capital M) — filter ignored; fix in Phase 2.
7. `member.update.ts`: `deleteAt` typo — fix in Phase 2.
8. `Property{type,location,title,price}` unique index too aggressive for plants — reconsider for `Plant` (Phase 3).

---

## PART B — DOMAIN MAPPING (Property → Plant)
| Nestar (Property) | Oasis (Plant) | Note |
|---|---|---|
| `propertyType` (APARTMENT/VILLA/HOUSE) | `plantType` (TREE/FLOWER/SHRUB/FRUIT_TREE + PALM/VINE/ORNAMENTAL/INDOOR_PLANT/SUCCULENT/…/OTHER) | biological/commercial form |
| — | `plantCategory` (EVERGREEN/FLOWERING/ORNAMENTAL/EDIBLE/SEASONAL/INDOOR/OUTDOOR) | **NEW** distinct axis |
| `propertyLocation` (Korean cities) | `supplyLocation` (`PlantLocation`, + more Korean cities) | supplied-from ≠ order delivery |
| — | `deliveryRadius: number` (km) | **NEW** |
| `propertyTitle/Desc/Price/Images` | `plantTitle/Desc/Price/Images` | rename |
| `propertySquare/Beds/Rooms` | drop → `plantHeight`, `potSize` | new physical attrs |
| `propertyBarter/Rent` | drop | replace `availableOptions` |
| `propertyStatus` (ACTIVE/SOLD/DELETE) | `plantStatus` (ACTIVE/SOLD_OUT/DELETE) | |
| `propertyViews/Likes/Comments/Rank` | `plantViews/Likes/Comments/Rank` | rename |
| `memberId` (agent) | `memberId` (agent) | unchanged |

Member: `memberProperties → memberPlants`; `memberArticles` **kept**. Role `MemberType.USER → CLIENT`.

### NEW — Order domain
`schema/Order.model.ts`: `plantId, customerId(ref Member), agentId(ref Member), deliveryAddress, installationDate, orderStatus, totalPrice`, timestamps; indexes on `customerId, agentId, plantId, orderStatus`. `OrderStatus = PENDING|CONFIRMED|IN_TRANSIT|INSTALLED|CANCELLED`. Service-enforced state machine (`PENDING→CONFIRMED→IN_TRANSIT→INSTALLED`; `CANCELLED` from PENDING/CONFIRMED/IN_TRANSIT; `INSTALLED` terminal). On create: `customerId` (auth), `agentId` (from Plant), `totalPrice` (from Plant) — never client-trusted. AuthZ: CLIENT own; AGENT own-plant orders; ADMIN all.

---

## PART C — PHASES
- **P1 ✅** Identity & foundation.
- **P2** Member + auth: `USER→CLIENT`; verify signup/login/JWT/guards/roles; fix bugs #6/#7.
- **P3** Plant domain: schema/DTOs/enums/resolver/service, type+category, supplyLocation, deliveryRadius, height/potSize, images, search, pagination, stats.
- **P4** Plant personalization + social: `meLiked`; like/view/follow/comment repointed `PROPERTY→PLANT`, `ARTICLE` kept.
- **P5** Order domain: schema/DTOs/enum/module/service/resolver, creation, ownership, state machine, cancellation.
- **P6** Order↔Plant↔Agent integration + authorization tests.
- **P7** Batch: `batchTopPlants` + `batchTopAgents`, fix bug #5.
- **P8** Security & validation hardening.
- **P9** Testing & regression (`tsc --noEmit`, jest, lint, real GraphQL).
- **P10** Cleanup: dead Property/USER refs, Notice/Notification, unused deps, docs.

After each phase: checks + report + 6–10 **recommended** git commands (I do not run git).
