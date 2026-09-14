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

### ✅ Phase 2 — Member + auth (done)
- `MemberType.USER → CLIENT` (enum `member.enums.ts`, `Member.model` default, `member.resolver` `@Roles`). `AGENT`/`ADMIN` already correct.
- Fixed bug #6: `getAllMembersByAdmin` filter `match.MemberStatus → match.memberStatus`.
- Fixed bug #7: `MemberUpdate` `deleteAt → deletedAt`.
- **Verified (real GraphQL + Oasis DB):** signup defaults to CLIENT; login/JWT ok; `checkAuth` ok; RolesGuard forbids CLIENT and allows ADMIN on `getAllMembersByAdmin`; `memberStatus` filter now works.
- 🟢 **Security fix (done):** closed two role-escalation vectors — (1) removed `memberType` from public `signup` `MemberInput`; (2) `updateMember` (self) now strips `memberType` + `memberStatus`. Verified: ADMIN signup rejected; CLIENT self-update to ADMIN/BLOCK ignored while normal fields still update. AGENT/ADMIN are now assignable **only** by an ADMIN via `updateMemberByAdmin`.
  - ⚠️ Bootstrap note: since signup can no longer mint an ADMIN, the **first admin must be seeded** (set `memberType:'ADMIN'` directly on one member doc in the `Oasis` DB, or via a one-off script). All later agents/admins are promoted by that admin.

### ✅ Phase 3 — Plant domain (done)
- New: `plant.enum.ts` (PlantType 11, PlantCategory 7, PlantStatus, PlantLocation 19 Korean cities), `Plant.model.ts` (collection `plants`, 2 indexes), flattened DTOs `libs/dto/plant/{plant,plant.input,plant.update}.ts`, and `components/plant/{service,resolver,module}.ts`.
- New plant fields: `plantType` + `plantCategory` (distinct axes), `supplyLocation` + `deliveryRadius` (supply origin, ≠ order delivery), `plantHeight` + `potSize`; dropped real-estate fields (square/beds/rooms/barter/rent).
- CRUD + AGENT-only create/update + ADMIN ops + search (type/category/location/price/height/text) + `$facet` pagination + `meLiked` + view/like stats + `memberPlants`.
- Repointed shared code: Like/View/Comment/Notification group `PROPERTY→PLANT`; `like.service`→`getFavoritePlants`, `view.service`→`getVisitedPlants`, `config` favorite/visit lookups→`plants`; `comment.service` routes plant comments via `PlantService`; `components`/`comments` modules wire `PlantModule`.
- Member: `memberProperties → memberPlants` (schema + DTO).
- Batch (pulled forward to keep compiling): migrated to `Plant`/`PlantStatus`, `batchTopPlants`, `memberPlants`; **fixed the two cron copy-paste bugs** (rollback + agents now call the right service methods). Scheduling/formula final verification remains Phase 7.
- Deleted: `components/property/*`, `dto/member/property/*`, `property.enum.ts`, `Property.model.ts`. No `property` references remain (except none — verified).
- **Verified (real GraphQL + Oasis DB):** all 8 plant-domain checks passed; both apps build; `tsc --noEmit` clean.
- Note: DTO flattening applied to `plant` (and `order` later); the social DTOs under `dto/member/*` are left in place and flattened in Phase 10.

### ✅ Phase 4 — Plant personalization + social (done — verification only)
- No code changes: the social layer was already repointed to PLANT in Phase 3. This phase exercised it end-to-end against the real Oasis DB.
- **Verified:** follow (subscribe/unsubscribe CLIENT↔AGENT, self-subscribe denied, `memberFollowers`/`memberFollowings` consistent, `meFollowed`); comments on **PLANT + MEMBER(agent) + ARTICLE** (each stat `plantComments`/`memberComments`/`articleComments` increments) + `getComments` with `memberData`; member like (`likeTargetMember` → `memberLikes`, `getAgents` `meLiked`); plant `meLiked` for authenticated viewer; favorites/visited (Phase 3).
- Articles confirmed working (community board kept per your decision).

### ✅ Phase 5 — Order domain (done)
- New: `order.enum.ts` (OrderStatus), `Order.model.ts` (collection `orders`, 3 indexes), flattened DTOs `libs/dto/order/{order,order.input,order.update}.ts`, `components/order/{service,resolver,module}.ts`; added order messages to `Errors.ts` + `availableOrderSorts` to config; wired `OrderModule`.
- Model: `plantId, customerId, agentId, orderQuantity, totalPrice, deliveryAddress, deliveryCity?, installationDate, orderStatus`.
- **Server-derived trust boundary:** `OrderInput` accepts only `plantId, orderQuantity?, deliveryAddress, deliveryCity?, installationDate`. `customerId` (auth), `agentId` (from plant), `totalPrice` (plant.plantPrice × qty), `orderStatus` (PENDING) are all set server-side — never from the client.
- **State machine** (`OrderService.LEGAL_TRANSITIONS` + role rules): PENDING→CONFIRMED→IN_TRANSIT→INSTALLED; CANCELLED from PENDING/CONFIRMED/IN_TRANSIT; INSTALLED/CANCELLED terminal. Advancing = AGENT(owner)/ADMIN; CLIENT(owner) may only cancel from PENDING/CONFIRMED.
- **Ownership** enforced on every read/write (`assertCanAccess` / `assertCanTransition`).
- Delivery: `deliveryAddress` (+ optional `deliveryCity`) is the customer destination, deliberately separate from the plant's `supplyLocation`. **No geo distance check is performed** — data is modeled so `plant.supplyLocation` + `plant.deliveryRadius` vs `deliveryCity` can drive a real check later (documented, not faked).
- **Verified (real GraphQL + Oasis DB):** all create/state-machine/ownership/role/list checks passed; build + `tsc` clean.

### ✅ Phase 6 — Order↔Plant↔Agent integration (done — verification only)
- No code changes. Focused integration/edge verification against the real Oasis DB:
  - order vs non-existent plant → NO_DATA_FOUND; order vs SOLD_OUT plant → NO_DATA_FOUND (only ACTIVE plants orderable).
  - full business flow discover→view→order→CONFIRMED→IN_TRANSIT→INSTALLED.
  - **cross-agent isolation** proven with a real 2nd agent (promoted by ADMIN): agent B cannot touch agent A's order; agent B's `getAgentOrders` is empty; agent A sees only their own.
  - agent onboarding via `updateMemberByAdmin` (the Phase-2 fix path) confirmed.

### ✅ Phase 7 — Batch (done)
- Code was already migrated in Phase 3 (Plant/PlantStatus, `batchTopPlants`, `memberPlants`, cron bugs fixed). This phase **ran the real `BatchService`** (via a throwaway Nest application-context harness, since removed) against the Oasis DB.
- **Verified formulas:** plants `rank = plantLikes*2 + plantViews*1` (Maple 1,1→3; Pine 0,1→1; Palm 0,0→0 — all exact); agents `rank = memberPlants*4 + memberArticles*3 + memberLikes*2 + memberViews*1` (agt193349 4,0,1,2→20 — exact). `batchRollback` zeroes ranks first.
- **Cron wiring confirmed:** rollback 01:00:00 → top-plants 01:00:20 → top-agents 01:00:30, each handler calling its own service method (the two Nestar copy-paste bugs stay fixed).

### ✅ Phase 8 — Security & validation hardening (done)
Audited auth/authorization/ownership/validation/upload/logging/secrets. Fixed:
- **Password hash no longer in JWT:** `createToken` now `delete payload.memberPassword` before signing (was base64-readable in every token). Verified token payload has no `memberPassword`.
- **No secrets in logs:** removed `console.log` of bearer token (auth.guard), full member/response incl. hash (auth.service, member.service login), and signup/login inputs incl. plaintext password (member.resolver); trimmed the raw error dump in `app.module` formatError (+ safer optional chaining).
- **Upload path-traversal blocked:** new `validImageTargets = [member, plant, article]` + `isValidTarget`; both `imageUploader`/`imagesUploader` reject any other `target` (verified `../../evil` → rejected, nothing escaped; `plant` → written under `uploads/plant/`). Apollo CSRF-preflight guard on multipart is already active.
Prior fixes carried in: role-escalation (P2), ownership on plants/orders (P3/P5), server-derived order fields (P5).
- **Noted, not changed (with reason):** `ValidationPipe({whitelist:true})` deliberately NOT enabled — range/search sub-inputs (`PricesRange`, `HeightsRange`, …) have `@Field` but no class-validator decorators, so whitelisting would silently drop filter values; needs decorators added first. `CORS origin:true` is permissive (restrict per-env for prod). Weak `SECRET_TOKEN` + live Atlas creds in `.env` — **rotate** (can't do it for you). comment/like/view don't verify the target ref exists (low severity, orphan stats only). `isValidImage` uses mime-OR-ext (could tighten to AND).

### ✅ Phase 9 — Testing & regression (done)
- Replaced dead default scaffolds with a real, runnable jest suite (**26 tests, 4 suites, all green**):
  - `order.service.spec.ts` (15) — createOrder server-derives agentId/totalPrice + rejects missing plant / past date; full state machine (legal advances, illegal jumps/skips, terminal INSTALLED); role rules (client can't advance, client cancel only PENDING/CONFIRMED, admin cancel from IN_TRANSIT); ownership (stranger blocked on read/write).
  - `like.service.spec.ts` — toggle returns +1 (create) / −1 (delete); `checkLikeExistence`.
  - `config.spec.ts` — `isValidTarget` (path-traversal guard), `isValidImage`, `shapeIntoMongoObjectId`.
  - `app.controller.spec.ts` — fixed to the Oasis welcome string.
- Removed broken DI-less `member.resolver.spec.ts`. Added `test/uuid.stub.js` + jest `moduleNameMapper` for the ESM-only `uuid` (so importing `config.ts` works under jest).
- Gates: `jest` 26/26 ✅, `tsc --noEmit` 0 ✅, `nest build` (both) ✅. Live GraphQL flows already covered per-phase (P2–P8).
- ⚠️ **`npm run lint` is pre-existing-broken**: `eslint.config.mjs` imports the `typescript-eslint` meta package which isn't in devDependencies (only `@typescript-eslint/parser` + `eslint-plugin` are). Not caused by this migration. Fix needs either installing `typescript-eslint` or rewriting the flat config — deferred (dep install) pending your OK.

### ➕ Feature — Accessory domain (new component, done)
Gardening accessories sold alongside plants (pots, watering cans, compost, fertilizer, tools…), built to full parity with Plant.
- New: `accessory.enum.ts` (AccessoryType 11, AccessoryCategory 7, AccessoryStatus; reuses `PlantLocation` for `supplyLocation`), `Accessory.model.ts` (collection `accessories`, 2 indexes), flattened DTOs `libs/dto/accessory/{accessory,accessory.input,accessory.update}.ts`, `components/accessory/{service,resolver,module}.ts`.
- Fields: `accessoryType` + `accessoryCategory` (distinct axes), `accessoryTitle/Price/Brand?/Images/Desc?`, `supplyLocation` + `deliveryRadius`, `accessoryViews/Likes/Comments/Rank`, `memberId` (agent).
- API: `createAccessory` (AGENT), `getAccessory`, `getAccessories` (search type/category/location/price/text + `$facet` pagination + `meLiked`), `updateAccessory` (AGENT, ownership), `getAgentAccessories`, `likeTargetAccessory`, `getFavoriteAccessories`, `getVisitedAccessories`, admin get-all/update/remove. Query names are accessory-specific to avoid GraphQL collisions with plant's generic `getFavorites`/`getVisited`.
- Social: `ACCESSORY` added to Like/View/Comment/Notification groups; `like.service.getFavoriteAccessories`, `view.service.getVisitedAccessories`, `comment.service` ACCESSORY case (`accessoryComments`); config `availableAccessorySorts` + favorite/visit lookups. Reused `PricesRange`/`PeriodsRange`/`OrdinaryInquiry` from plant DTO (no duplicate GraphQL types).
- Member: new `memberAccessories` stat (schema + DTO), incremented on create / decremented on sold-out/delete. (Left OUT of the batch agent-rank formula to keep Phase-7 verification valid — can be added later.)
- **Verified (real GraphQL + Oasis DB):** create (AGENT-only), search/filter, view, like, ACCESSORY comment, favorites, `memberAccessories` stat — all pass; schema builds; `tsc`/`jest` green.
- **Not integrated into Order** (Order still references `plantId` only). If you want accessories to be orderable, that's a follow-up (Order needs an item-type or a separate `accessoryId`).

### ✅ Phase 10 — Production cleanup (done)
- Removed dead code: `Notice.model`, `Notification.model`, `notice.enum`, `notification.enum` (never wired to any module), and the empty `common.enum.ts`.
- Removed unused imports: `Errors.ts` stray `import {register} from 'module'`, `view.module` `Mongoose`, `member.input` lowercase `min`.
- Rewrote `README.md` to document **Oasis** (was the stock NestJS starter): domain, roles, products, order state machine, supply-vs-delivery, apps/ports, setup, run, test, conventions.
- **Consistency sweep (repo-wide):** `nestar` 0 · `MemberType.USER` 0 · Notice/Notification files 0 · `property` 1 (an intentional negative test string `isValidTarget('property')`).
- Gates: `nest build` (both) ✅ · `tsc --noEmit` 0 ✅ · `jest` 26/26 ✅.

**Remaining optional items (not done — need your call):**
- **Flatten social DTOs** (`dto/member/{like,follow,comment,view,board-article}` → `dto/*`) to match plant/order/accessory. Deferred: large, purely-cosmetic path churn across many files touching working code; recommend a dedicated pass if wanted.
- **Fix `npm run lint`** (pre-existing broken — missing `typescript-eslint` dep). Needs a dep install or flat-config rewrite.
- Rotate the live Atlas credentials + weak `SECRET_TOKEN` in `.env`.
- Optionally: add accessories to Order (orderable), add `memberAccessories` to the batch agent-rank formula, restrict CORS for prod.

---

## 🔧 Post-build refinements (user-requested)
- **`plantTitle → plantName`** and **`accessoryTitle → accessoryName`** (schema, DTOs, service text-search + unique index). Dev DB may hold old docs with the old field — clear/re-seed or run a rename migration.
- **Upload target allowlist** now includes `accessory` (`validImageTargets = [member, plant, accessory, article]`) so accessory images can be uploaded.
- **Order status split** (clearer roles):
  - `updateOrderStatus` → **RolesGuard(AGENT, ADMIN)**, advance-only (CONFIRMED/IN_TRANSIT/INSTALLED); rejects `CANCELLED` and non-owned orders.
  - new **`cancelOrder(orderId)`** → AuthGuard: owning CLIENT may cancel from PENDING/CONFIRMED; owning AGENT / ADMIN from PENDING/CONFIRMED/IN_TRANSIT.
  - `getAgentOrders` kept (agent's incoming-orders dashboard — essential). Verified via real GraphQL; order unit tests updated (30/30 green).

## 🛒 Order → cart redesign (Order + OrderItem)
Reworked Order into a **multi-item, multi-agent cart** so one order can contain several products (plants + accessories) from different agents.
- New `schema/OrderItem.model.ts` (collection `orderitems`); `Order` is now a header (customerId, deliveryAddress, deliveryCity, orderTotal). Enum `OrderItemType` (PLANT|ACCESSORY).
- DTOs: `order.ts` (header + `items[]`), new `order-item.ts` (line + plant/accessory/agent joins), `order.input.ts` (`OrderInput` with `items[]`, `OrderItemInput`, `AgentItemsInquiry`), `order.update.ts` (`OrderItemStatusUpdate`).
- Per-item fulfilment: `createOrder` (CLIENT, cart), `getMyOrders`, `getOrder` (owner/admin), `getAgentItems` (agent's line queue), `updateOrderItemStatus` (AGENT owner/ADMIN advance), `cancelOrderItem` (owner client PENDING/CONFIRMED; owner agent/admin further), `getAllOrdersByAdmin`. Agent/price/totals all derived server-side; customerId+delivery denormalized onto items.
- **Verified (real GraphQL):** one order with plant(agentA)+accessory(agentB), per-agent isolation, advance vs cancel, mixed item statuses. tsc/jest green (26).
- Two issues found + fixed during verification: duplicate GraphQL type `AISearch` (renamed → `AgentItemSearch`); and a **DB migration** — dropped stale `plantTitle`/`accessoryTitle` unique indexes + `$rename`d the fields in old docs (see `scratchpad/migrate_rename.js`); also re-seeded `adm193349` as ADMIN.
- **Whole-order cancel added:** `cancelOrder(orderId)` (AuthGuard) — owning CLIENT cancels all its PENDING/CONFIRMED lines at once; ADMIN also IN_TRANSIT; installed/cancelled lines untouched. Per-item `cancelOrderItem` still available. Verified (non-owner FORBIDDEN; owner → all lines CANCELLED). jest 29.

## 🎉 PROJECT COMPLETE — Architectural consistency check (§50)
**Nestar DNA retained:** monorepo + app separation, resolver/service/module pattern, code-first GraphQL, `$facet` pagination, `lookupAuthMemberLiked/Followed` (no N+1), `memberStatsEditor`, guard trio (`Auth`/`Without`/`Roles`) + `@Roles`/`@AuthMember`, batch app.
**Oasis domain implemented:** `CLIENT/AGENT/ADMIN`; `Plant` (type+category, supplyLocation, deliveryRadius, height/potSize); `Accessory` (new); `Order` (state machine, ownership, server-derived trust); `Like/Follow/Comment/View` on plants+accessories+agents+articles. Security hardened (no role self-escalation, no password in JWT, no secret logging, upload allowlist). Real GraphQL verified each phase; 26 unit tests green.

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
