# Oasis

**Oasis** is a plant marketplace, delivery, and installation platform. Nurseries and plant
sellers (**agents**) list mature plants, trees, flowers and shrubs — plus the gardening
**accessories** sold alongside them (pots, watering cans, compost, fertilizer, tools) —
and customers (**clients**) discover, like, comment on, follow, and order them for delivery
and on-site installation.

Built on the proven architecture of a NestJS + GraphQL + MongoDB monorepo.

## Core flow

```
DISCOVER → VIEW PLANT → ORDER → AGENT CONFIRMS → DELIVERY → INSTALLATION → COMPLETED
```

## Tech stack

- **NestJS 10** (monorepo)
- **GraphQL** code-first via **Apollo Server 4** (`autoSchemaFile`, playground on)
- **MongoDB** + **Mongoose 8**
- **JWT** auth (`@nestjs/jwt`) + **bcryptjs**
- **graphql-upload** for images
- **@nestjs/schedule** for batch ranking jobs

## Applications

| App | Port | Role |
|-----|------|------|
| `apps/oasis-api` | **3013** | GraphQL API — auth, catalog, orders, social |
| `apps/oasis-batch` | **3014** | Scheduled ranking jobs (top plants / top agents) |

GraphQL endpoint & playground: `http://localhost:3013/graphql`

## Domain modules (`apps/oasis-api/src/components`)

`auth` · `member` · `plant` · `accessory` · `order` · `like` · `follow` · `comment` · `view` · `board-article`

### Member roles (`MemberType`)

- **CLIENT** — browse, search, like, comment, follow agents, place & track orders
- **AGENT** — create/manage plant & accessory listings, fulfil orders (confirm → in-transit → installed)
- **ADMIN** — manage members, listings, orders, and content

> Public sign-up always creates a **CLIENT**. `AGENT`/`ADMIN` are assigned only by an admin
> via `updateMemberByAdmin` — roles can never be self-selected.

### Products

- **Plant** — `plantType` (form: TREE, FLOWER, SHRUB, FRUIT_TREE, …) + `plantCategory`
  (classification: EVERGREEN, FLOWERING, EDIBLE, …), `plantHeight`, `potSize`.
- **Accessory** — `accessoryType` (POT, WATERING_CAN, COMPOST, FERTILIZER, …) + `accessoryCategory`.

Both carry a **`supplyLocation`** (the Korean city the item ships *from*) and an optional
**`deliveryRadius`** (km). This is deliberately distinct from an order's **`deliveryAddress`**
(where the *customer* wants it delivered). No geographic distance check is performed yet — the
data is modeled so one can be added later.

### Orders

`Order` links a client, a plant, and the plant's agent. Trusted fields are always derived
server-side: `customerId` (from the JWT), `agentId` (from the plant), `totalPrice`
(`plantPrice × quantity`). Status follows an enforced state machine:

```
PENDING → CONFIRMED → IN_TRANSIT → INSTALLED
   └─────────┴────────────┴──────────► CANCELLED
```

- Agents/admins advance fulfilment; clients may cancel only while `PENDING`/`CONFIRMED`.
- `INSTALLED` and `CANCELLED` are terminal. Ownership is checked on every read/write.

## Getting started

```bash
npm install
```

Create a `.env` in the repo root (it is git-ignored — never commit real secrets):

```
PORT_API=3013
PORT_BATCH=3014
MONGO_DEV=mongodb+srv://<user>:<pass>@<cluster>/Oasis
MONGO_PROD=mongodb+srv://<user>:<pass>@<cluster>/Oasis
SECRET_TOKEN=<a-strong-random-secret>
```

## Run

```bash
# API (dev, watch) — http://localhost:3013/graphql
npm run start:dev

# Batch (dev, watch)
npm run start:dev:batch

# production
npm run build
npm run start:prod
npm run start:prod:batch
```

## Test

```bash
npm test          # jest unit tests
npm run test:cov  # coverage
npx tsc --noEmit  # type-check
```

## Project layout

```
apps/
├── oasis-api/
│   └── src/
│       ├── components/   # auth, member, plant, accessory, order, like, follow, comment, view, board-article
│       ├── libs/
│       │   ├── dto/      # graphql types & inputs (plant, accessory, order flat; member holds social dtos)
│       │   ├── enums/    # member, plant, accessory, order, like, view, comment, board-article
│       │   ├── config.ts # aggregation helpers, upload guards, sort whitelists
│       │   └── Errors.ts # HttpCode / Message / Direction
│       ├── schema/       # Mongoose models
│       └── socket/       # websocket gateway (reserved for future live order status)
└── oasis-batch/          # cron ranking jobs
```

## Conventions

- **Listing queries** use a single `$match → $sort → $facet{ list, metaCounter }` aggregation
  (one round-trip for page + total). Personalized `meLiked`/`meFollowed` come from `$lookup`
  sub-pipelines — no N+1.
- **Guards:** `AuthGuard` (token required), `WithoutGuard` (optional — personalizes if present),
  `RolesGuard` + `@Roles(MemberType.X)`. Current member via `@AuthMember()`.
- **Member statistics** (`memberPlants`, `memberAccessories`, `memberLikes`, `memberFollowers`, …)
  are updated through a single `memberStatsEditor`.
