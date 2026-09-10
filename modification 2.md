# Modification 2 — "Bogbon" loyihasini Nestar naqshi asosida qurish uchun prompt

> Bu fayl — **Claude'ga to'g'ridan-to'g'ri beriladigan prompt** sifatida yozilgan. Yangi Claude Code sessiyasida (yoki shu loyihaning yangi nusxasida) ushbu faylni ochib, "shu faylda yozilganlarga asosan loyihani qur" desangiz, Claude nima qilish kerakligini to'liq tushunadi — chunki bu yerda ham **naqsh-manba (Nestar)**, ham **yangi loyiha talablari (Bogbon)** batafsil tavsiflangan.

---

## 1-QISM — NAMUNA LOYIHA: NESTAR (arxitektura manbasi)

Quyidagi loyiha — **Nestar** (ko'chmas mulk + ijtimoiy tarmoq platformasi) — allaqachon qurilgan va ishlaydi. Yangi loyiha (**Bogbon**) aynan shu loyihaning **arxitekturasini, naqshlarini va kod uslubini** takrorlashi kerak, faqat mavzu (domen) boshqa.

### 1.1 — Texnik stack

- **Backend framework:** NestJS (TypeScript)
- **API turi:** GraphQL (Apollo Server, "code-first" yondashuv — schema kod orqali avtomatik generatsiya qilinadi)
- **Ma'lumotlar bazasi:** MongoDB + Mongoose (ODM)
- **Autentifikatsiya:** JWT (`@nestjs/jwt`), parol xeshlash — `bcryptjs`
- **Fayl yuklash:** `graphql-upload` (GraphQL multipart request spec orqali)
- **Vaqt-rejalashtirilgan vazifalar:** `@nestjs/schedule` (`@Cron`, `@Interval`, `@Timeout`)
- **Monorepo tuzilishi:** bitta repo ichida **2 ta alohida NestJS ilovasi**:
  - `apps/<nomi>-api` — asosiy GraphQL API (foydalanuvchi so'rovlariga javob beradi)
  - `apps/<nomi>-batch` — fon rejimida, vaqt bo'yicha ishlaydigan server (masalan, tunda reyting hisoblash)

### 1.2 — Umumiy arxitektura naqshi (har bir domen uchun)

Har bir domen (masalan "Property", "Member") — **3 qatlamli** tuzilishga ega:

```
<domen>.resolver.ts   →  GraphQL so'rovlarini qabul qiladi (Query/Mutation), guard'larni belgilaydi
<domen>.service.ts    →  Barcha biznes-mantiq, MongoDB bilan ishlash shu yerda
<domen>.module.ts     →  Yuqoridagi ikkisini "bog'laydi", boshqa modullarni import qiladi
```

Har bir domen — **o'zining alohida NestJS modulida** (`@Module`), va `ComponentsModule` (yoki shunga o'xshash markaziy modul) orqali asosiy ilovaga ulanadi.

### 1.3 — DTO fayl konvensiyasi (har bir domen uchun 2-3 fayl)

```
libs/dto/<domen>/<domen>.ts          → @ObjectType() — SERVER QAYTARADIGAN shakl (chiqish)
libs/dto/<domen>/<domen>.input.ts    → @InputType() — YARATISH/QIDIRISH uchun kirish (barcha maydon majburiy)
libs/dto/<domen>/<domen>.update.ts   → @InputType() — YANGILASH uchun kirish (barcha maydon ixtiyoriy, faqat _id majburiy)
```

**Muhim qoida:** Agar bir maydon `@InputType()`da `nullable: true` bo'lsa, class-validator tomonida ham `@IsOptional()` bo'lishi SHART (aks holda GraphQL schema va validatsiya bir-biriga zid bo'lib qoladi — bu Nestar loyihasida ko'p marta uchragan bug turi edi).

### 1.4 — Guard tizimi (ruxsat darajalari)

- **`AuthGuard`** — token MAJBURIY, login qilmagan foydalanuvchi so'rov yubora olmaydi
- **`WithoutGuard`** — token IXTIYORIY: bo'lsa foydalanuvchini aniqlaydi (shaxsiylashtirilgan natija uchun), bo'lmasa ham so'rovni bloklamaydi
- **`RolesGuard`** (+ `@Roles(MemberType.X)` dekoratori) — faqat aniq rol(lar)ga ruxsat beradi (masalan faqat ADMIN)

### 1.5 — Foydalanuvchi (Member) tizimi

- 3 xil rol: **USER** (oddiy), **AGENT** (kontent/e'lon yarata oladi), **ADMIN** (hammasini boshqaradi)
- Har bir Member'da **avtomatik hisoblanadigan statistika maydonlari** bor: `memberProperties`, `memberLikes`, `memberViews`, `memberFollowers`, `memberFollowings`, `memberRank` va h.k. — bular qo'lda emas, tegishli amal (like bosilganda, follow qilinganda) sodir bo'lganda **`memberStatsEditor()`** degan markaziy metod orqali `$inc` bilan avtomatik oshadi/kamayadi

### 1.6 — Ijtimoiy qatlam (har qanday domenga qo'shsa bo'ladigan, qayta ishlatiladigan naqsh)

- **Like** — alohida `likes` collection'i, `{memberId, likeRefId, likeGroup}` (`likeGroup` — MEMBER/PROPERTY/ARTICLE kabi, bitta collection ko'p turdagi like uchun ishlatiladi). Like bosish — **toggle** (qayta bossa, o'chadi). Unique indeks: `{memberId, likeRefId}`
- **Follow** — `follows` collection'i, `{followerId, followingId}`, unique indeks bilan
- **View** — `views` collection'i, `{memberId, viewRefId, viewGroup}` — "kim, nimani, qachon ko'rgani" — takroriy ko'rishni hisoblamaslik uchun unique indeks
- **Comment** — `{memberId, commentRefId, commentGroup, commentContent}` — turli obyektlarga (member/property/article) izoh qoldirish uchun bitta umumiy collection

**meLiked / meFollowed naqshi:** Har qanday ro'yxat (masalan property ro'yxati) qaytarilganda, agar so'rovchi login qilgan bo'lsa, har bir elementga **"men buni like bosganmanmi"** (`meLiked`) va **"men buni follow qilganmanmi"** (`meFollowed`) degan qo'shimcha maydonlar MongoDB `$lookup` (`let` + `pipeline` + `$expr`) orqali qo'shib qo'yiladi — bu alohida so'rov yubormasdan, bitta aggregatsiya ichida amalga oshadi.

### 1.7 — Aggregatsiya (ro'yxat qaytarish) naqshi

Har qanday "ro'yxat" (`getProperties`, `getMembers` va h.k.) quyidagi bosqichlardan iborat:

```
$match       → filtrlash (status, joylashuv, narx oralig'i va h.k.)
$sort        → saralash
$facet       → BITTA so'rovda IKKI xil natija:
                 - list: [$skip, $limit, $lookup (bog'liq ma'lumot), $unwind] — sahifalangan ro'yxat
                 - metaCounter: [$count] — filtrga mos JAMI son
```

Natija tipi har doim: `{ list: T[], metaCounter: [{total: number}] }`.

### 1.8 — "Batch" server (fon vazifalari)

Alohida ilova (`apps/<nomi>-batch`), asosiy API'dan **mustaqil ishlaydi**, lekin **bir xil MongoDB'ga** ulanadi va asosiy ilovaning DTO/schema fayllarini **to'g'ridan-to'g'ri import qiladi** (monorepo `baseUrl` orqali, masalan `import { Property } from 'apps/nestar-api/src/libs/dto/...'`). Vazifasi — `@Cron` orqali, masalan har kecha, reytingni (like/view sonlariga qarab) qayta hisoblab, bazaga yozib qo'yish.

---

## 2-QISM — YANGI LOYIHA: BOGBON (qurilishi kerak bo'lgan loyiha)

### 2.1 — Loyiha g'oyasi

**Bogbon** — o'sgan (tayyor, katta) daraxt va gullarni mijozning manziliga olib borib, o'rnatib beradigan xizmat platformasi. Nestar'ning "ko'chmas mulk" mavzusi o'rniga — "o'simlik" mavzusi, lekin arxitektura bir xil qoladi.

### 2.2 — Foydalanuvchi rollari

- **USER** — mijoz, o'simlik buyurtma qiladi
- **AGENT** — ko'chatxona/pitomnik egasi, o'simlik e'lonlarini joylashtiradi (Nestar'dagi "Property egasi"ga o'xshash)
- **ADMIN** — platformani boshqaradi

### 2.3 — Asosiy entity: `Plant` (Nestar'dagi `Property`ning o'rnini bosadi)

**Taklif qilinadigan maydonlar** (Property'ga solishtirib moslashtirilgan):

| Bogbon (`Plant`) | Nestar'dagi mos keladigan (`Property`) | Izoh |
|---|---|---|
| `plantType` (DARAXT / GUL / BUTA) | `propertyType` (APARTMENT/HOUSE) | enum |
| `plantCategory` (masalan: DOIM_YASHIL, GULLAYDIGAN, MEVALI) | `propertyLocation` | enum |
| `plantTitle` | `propertyTitle` | string |
| `plantDesc` | `propertyDesc` | string |
| `plantPrice` | `propertyPrice` | number |
| `plantHeight` (bo'yi, sm) | `propertySquare` | number |
| `potSize` (idish o'lchami) | `propertyBeds`/`propertyRooms` | number |
| `plantImages` | `propertyImages` | string[] |
| `deliveryRadius` (km) | — (yangi, Bogbon'ga xos) | number |
| `plantViews`, `plantLikes`, `plantComments`, `plantRank` | `propertyViews`, `propertyLikes`, ... | avtomatik statistika |
| `memberId` (AGENT/ko'chatxona egasi) | `memberId` | ObjectId |

### 2.4 — Yangi entity: `Order` (Nestar'da YO'Q — Bogbon'ga xos, chunki bu xizmat, sof e'lon emas)

Bu — eng muhim **arxitektura farqi**: Bogbon shunchaki "e'lon ko'rish" emas, balki **buyurtma/bron qilish jarayoni** talab qiladi.

**Taklif qilinadigan maydonlar:**

| Maydon | Tipi | Izoh |
|---|---|---|
| `_id` | ObjectId | |
| `plantId` | ObjectId | qaysi o'simlik buyurtma qilingan |
| `customerId` | ObjectId | buyurtma bergan USER |
| `agentId` | ObjectId | ko'chatxona egasi (tasdiqlaydi/bajaradi) |
| `deliveryAddress` | string | yetkazib berish manzili |
| `installationDate` | Date | o'rnatish rejalashtirilgan sanasi |
| `orderStatus` | enum: `PENDING` → `CONFIRMED` → `IN_TRANSIT` → `INSTALLED` / `CANCELLED` | buyurtma holati (workflow) |
| `totalPrice` | number | |
| `createdAt`, `updatedAt` | Date | |

**`OrderStatus` workflow (holat mashinasi):**
```
PENDING (mijoz buyurtma berdi)
   → CONFIRMED (agent tasdiqladi)
   → IN_TRANSIT (yo'lda)
   → INSTALLED (o'rnatildi, yakunlandi)

Istalgan bosqichda → CANCELLED (bekor qilindi)
```

### 2.5 — Ijtimoiy qatlam — Nestar'dan TO'LIQ meros olinadi

- **Like** — `Plant`ga like bosish (Nestar'dagi Property like'ining aynan o'zi, faqat `likeGroup: PLANT`)
- **Comment** — o'simlikka yoki bajarilgan buyurtmaga (natija rasmi bilan) izoh qoldirish
- **Follow** — ko'chatxonalarni (AGENT'larni) follow qilish
- **View** — kim qaysi o'simlikni ko'rgani

### 2.6 — Modullar ro'yxati (Nestar'dagi kabi)

```
member      → foydalanuvchi, autentifikatsiya (Nestar bilan bir xil, deyarli o'zgarishsiz)
plant       → Property'ning o'rnini bosuvchi asosiy modul
order       → YANGI modul — buyurtma boshqaruvi
comment     → Nestar bilan bir xil naqsh
like        → Nestar bilan bir xil naqsh (LikeGroup'ga PLANT qo'shiladi)
follow      → Nestar bilan bir xil naqsh
view        → Nestar bilan bir xil naqsh
auth        → Nestar bilan bir xil (JWT, guard'lar)
```

### 2.7 — Batch server uchun g'oya

Nestar'dagi `batchTopProperties`/`batchTopAgents`ga o'xshab: **`batchTopPlants`** (like/view asosida o'simlik reytingini hisoblash) va **`batchTopAgents`** (ko'chatxonalar reytingi) — bir xil formula naqshi (`plantLikes * 2 + plantViews * 1` kabi) qo'llanilishi mumkin.

---

## 3-QISM — CLAUDE UCHUN ISH TOPSHIRIG'I (asosiy prompt qismi)

> Quyidagi qism — Claude'ga bevosita beriladigan ko'rsatma. Yuqoridagi 1- va 2-qism — shu ko'rsatmani bajarish uchun kerakli **kontekst**.

Menga **Bogbon** nomli yangi loyihani, yuqorida (1-QISM) tavsiflangan **Nestar arxitekturasi naqshiga to'liq amal qilgan holda**, lekin (2-QISM)da tavsiflangan **yangi domen (o'simlik yetkazib berish xizmati)** bilan qur. Aniqrog'i:

1. **Monorepo tuzilishini** Nestar'dagidek yarat (`apps/bogbon-api`, keyinroq kerak bo'lsa `apps/bogbon-batch`)
2. **NestJS + GraphQL (Apollo, code-first) + MongoDB/Mongoose** stack'ini ishlat
3. Har bir domen uchun **3 qatlamli** (`resolver.ts` / `service.ts` / `module.ts`) va **DTO 3-fayl** (`.ts` / `.input.ts` / `.update.ts`) konvensiyasiga qat'iy amal qil
4. Avval **`member`** va **`auth`** modullarini qur (Nestar'dagi bilan deyarli bir xil, faqat loyiha nomiga moslab)
5. Keyin **`plant`** modulini — Nestar'dagi `property` modulining **to'liq analogi** sifatida (CRUD, qidiruv/filtrlash, sahifalash, `meLiked` naqshi bilan)
6. Keyin **`order`** modulini — bu Nestar'da yo'q, **yangi**, workflow-status bilan (yuqoridagi 2.4-bo'limga qara)
7. Keyin ijtimoiy qatlamni (`like`, `follow`, `comment`, `view`) — Nestar'dagi bilan **bir xil naqshda**, faqat `plant`ga moslab
8. Har bir bosqichda **TypeScript kompilyatsiyasini tekshir** (`tsc --noEmit`) va **real GraphQL so'rov bilan sinab ko'r**, xuddi Nestar loyihasida qilingani kabi

**Boshlashdan oldin so'ra:** Agar biror joyda (masalan, `Order`ning aniq maydonlari, yoki `Plant`ning qo'shimcha xususiyatlari) noaniqlik bo'lsa, taxmin qilib davom etishdan oldin men bilan aniqlashtirib ol.
