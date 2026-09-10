# 20-avgust ish jarayoni — taqdimot (PPT) uchun mukammal prompt

Bu faylni taqdimot yaratuvchi AI vositaga (Gamma, Tome, Canva AI, yoki Claude/ChatGPT "slides" rejimiga) to'liq nusxalab bering.

---

## 1-QISM: AI VOSITASIGA BERILADIGAN PROMPT

```
Men NestJS + GraphQL + MongoDB texnologiyalari bilan "Nestar" nomli
backend loyihasi ustida ishlayapman. Bugun (20-avgust) men va yordamchi
AI birgalikda ko'plab real xatolarni topib tuzatdik. Menga shu kunlik
ishni chuqur, lekin sodda tilda tushuntiruvchi, 22-26 slayddan iborat
professional taqdimot tuzib ber.

Auditoriya: NestJS/GraphQL o'rganayotgan backend dasturchilar jamoasi
(o'z jamoamga qilgan ishimni hisobot sifatida ko'rsataman).
Ohang: aniq, texnik, lekin har bir tushunchani sodda so'zlar bilan
izohlaydigan. Har bir voqea uchun: "muammo nima edi -> sabab nimada
edi -> qanday tuzatildi -> nimadan saboq oldik" formatida tushuntir.

Taqdimot tuzilishi:

BO'LIM 1 — Kirish (1 slayd)
  Sarlavha: "20-avgust: Nestar loyihasida xatolarni topish va tuzatish"
  Kun davomida nechta muammo tuzatilgani (son bilan, masalan "9 ta
  asosiy muammo") va ularning umumiy toifalari (paket boshqaruvi,
  GraphQL schema, xavfsizlik, server barqarorligi)

BO'LIM 2 — Paket boshqaruvi inqirozi (3-4 slayd)
  2-QISM/1-bo'lim asosida: boshqa loyihadan package.json ko'chirib
  olishning oqibatlari — versiyalar to'qnashuvi, papka nomi xatosi,
  yo'qolgan sozlamalar. Jadval: "nima buzildi" vs "qanday tuzatildi"

BO'LIM 3 — GraphQL schema va turlar nomuvofiqligi (4-5 slayd)
  2-QISM/2-bo'lim asosida uchta alohida holatni ko'rsat:
  - accessToken: Date vs String nomuvofiqligi
  - memberLikes/memberViews/memberWarnings yo'qolib qolgani
    (Mongoose sxemasi va GraphQL turi orasidagi farq diagrammasi
    bilan — ikkita alohida "qatlam" borligini ko'rsat)
  Diagramma: Mongoose Schema <-> GraphQL ObjectType ikki alohida
  qatlam ekanini ko'rsatuvchi chizma

BO'LIM 4 — Postman/GraphQL so'rov xatolari (3-4 slayd)
  2-QISM/3-bo'lim asosida: $input o'zgaruvchisi ishlatilmagan holat,
  literal "null" yozish xatosi, "selection subfields" talabi.
  Har biri uchun noto'g'ri va to'g'ri so'rov namunasini yonma-yon
  ko'rsat

BO'LIM 5 — Xavfsizlik bo'shlig'i: himoyasiz Admin metodi (2-3 slayd)
  2-QISM/4-bo'lim asosida: updateMemberByAdmin'da Guard yo'qligi —
  bu real production'da nima uchun xavfli ekanini tushuntir
  ("har qanday tizimga kirmagan odam boshqa a'zolarni o'zgartira
  olardi" kabi aniq stsenariy bilan)

BO'LIM 6 — Server barqarorligi: EADDRINUSE va race condition
  (5-6 slayd — bu eng chuqur texnik voqea, ko'proq joy ber)
  2-QISM/5-bo'lim asosida to'liq voqeani ketma-ket tushuntir:
  1) muammo nimada ko'rindi (xato matni)
  2) qanday tekshirildi (ps aux orqali jarayonlarni kuzatish)
  3) haqiqiy sabab nima edi (eski/yangi jarayon poygasi)
  4) qanday tuzatildi (retry mexanizmi kodi bilan)
  5) natija qanday tasdiqlandi (test natijalari)
  Diagramma: "eski jarayon o'lishi" va "yangi jarayon boshlanishi"
  orasidagi vaqt tanaffusini ko'rsatuvchi timeline

BO'LIM 7 — Yakuniy xulosa va sabog'lar (1-2 slayd)
  - Bugungi ishdan olingan 4-5 ta umumiy saboq (masalan: "boshqa
    loyihadan konfiguratsiya faylini ko'chirmang", "GraphQL va
    Mongoose sxemalari alohida sinxronlanishi kerak" va h.k.)

MUHIM TALABLAR:
1. Har bir bo'limda kamida bitta jadval yoki diagramma bo'lsin.
2. Kod namunalarini "OLDIN" (xato) / "KEYIN" (to'g'ri) qilib
   qizil/yashil rang bilan solishtirib ko'rsat.
3. BO'LIM 6 uchun alohida "tergov jarayoni" (investigation timeline)
   uslubidagi vizual tuz — bu eng dramatik va o'quv jihatidan boy
   voqea edi.
4. Texnik atama birinchi ishlatilganda 1 jumlali sodda izoh ber.
```

---

## 2-QISM: TAQDIMOT MAZMUNI UCHUN MATERIAL (manba)

### 1-bo'lim: Paket boshqaruvi inqirozi

**Voqea:** `@nestjs/jwt` o'rnatishga urinishda peer-dependency xatosi chiqdi. Buni hal qilish uchun boshqa (kurs) loyihasidan **butun `package.json`** nusxa ko'chirilib, o'zining ustiga almashtirildi.

**Nima buzildi:**

| # | Muammo | Sabab |
|---|---|---|
| 1 | `start:prod`/`test:e2e` ishlamay qoldi | Skriptlar `dist/apps/nestar**s**-api/main` (qo'shimcha "s" bilan) deb noto'g'ri papkaga ishora qilardi |
| 2 | `NODE_ENV` yo'qolib qoldi | `cross-env NODE_ENV=...` skriptlardan olib tashlangan edi — bu avval alohida tuzatilgan eski bug'ni qaytardi |
| 3 | NestJS v11 → v10'ga tushib qoldi | Butun paket ro'yxati boshqa loyihaniki bilan almashtirilgani uchun |
| 4 | `auth.module.ts`/`auth.service.ts`da import xatolari | `HttpModule`, `JwtModule`, `JwtService` import qilinmagan edi |

**Qanday tuzatildi:** Papka nomlarini to'g'irladik, `cross-env`ni qayta o'rnatib skriptlarga qaytardik, yetishmayotgan importlarni qo'shdik. Build va server ishga tushishini test qilib tasdiqladik.

**Saboq:** Boshqa loyihadan butun konfiguratsiya faylini ko'chirish — kerakli paketni alohida o'rnatishdan (`npm install @nestjs/jwt`) ancha xavfliroq, chunki u ko'zga ko'rinmas ko'p narsani (papka nomlari, versiyalar, skriptlar) birga o'zgartirib yuboradi.

---

### 2-bo'lim: GraphQL schema va Mongoose sxemasi — ikki alohida qatlam

**Muhim tushuncha:** Loyihada ma'lumot **ikki marta** tavsiflanadi:
1. **Mongoose sxemasi** (`Member.model.ts`) — ma'lumot bazasida qanday saqlanishini belgilaydi
2. **GraphQL turi** (`member.ts`, `@Field()` dekoratorlari bilan) — client (Postman/frontend) API orqali nimani **ko'ra olishini** belgilaydi

Bu ikkalasi **avtomatik sinxronlanmaydi** — dasturchi ikkalasini ham qo'lda mos holda yozishi kerak. Aynan shu joyda ikkita real xato yuz berdi:

**Xato 1 — `accessToken` turi nomuvofiqligi:**
```ts
// member.ts (XATO)
@Field(() => Date, { nullable: true })
accessToken?: string;
```
Maydon **haqiqatda matn** (JWT token) edi, lekin GraphQL'ga "bu sana (Date)" deb aytilgan edi. Natija: `accessToken` so'ralganda GraphQL serializatsiya xatosi.
**Tuzatish:** `@Field(() => Date)` → `@Field(() => String)`.

**Xato 2 — uchta maydon butunlay "ko'rinmas" edi:**
`Member.model.ts` (Mongoose)da `memberLikes`, `memberViews`, `memberWarnings` bor edi, lekin `member.ts` (GraphQL)da ular uchun `@Field()` yozilmagan edi. Natija: Devex Academy kursining avtomatik tekshiruvchisi bu maydonlarni so'raganda `"Cannot query field ... on type Member"` xatosi bilan **fail** bo'ldi.
**Tuzatish:** Uchala maydonga ham `@Field(() => Int)` qo'shildi.

**Umumiy saboq:** Yangi maydon qo'shganda, uni **ikkala joyda ham** (Mongoose sxemasi VA GraphQL turi) mos qilib yozish kerak — biri boshqasini avtomatik yangilamaydi.

---

### 3-bo'lim: Postman/GraphQL so'rov xatolari (client tomonidagi xatolar)

| Xato | Sabab | To'g'ri yozilishi |
|---|---|---|
| `"Variable "$input" is never used"` | `signup(input: null)` deb **literal** "null" yozilgan, `$input` ishlatilmagan | `signup(input: $input)` |
| Xuddi shu xato, boshqa holatda | `signup {` — argument umuman yo'q qolib ketgan | `signup(input: $input) {` |
| Checkbox orqali `null` qiymatlar hosil bo'lishi | Postman'da `input`ning **ichki** maydonlarini (memberNick va h.k.) alohida belgilash, ularni Variables'dan emas, qo'lda to'ldiriladigan literal qiymatlarga aylantiradi | `input` maydonining faqat **ustki darajasini** belgilab, ichini qo'lda `$input` deb yozish |
| `"must have a selection of subfields"` | `getAllMembersByAdmin` turi `String`dan `[Member]`ga o'zgargandan keyin, obyekt uchun `{ }` ichida aniq maydonlar ko'rsatilmagan | `getAllMembersByAdmin { _id memberNick ... }` |

**Umumiy naqsh:** GraphQL'da **scalar** (`String`, `Int`) qiymatlarni so'rashda `{ }` kerak emas, lekin **obyekt** (`Member`, `[Member]`) qiymatlarni so'rashda **har doim** aniq qaysi maydonlar kerakligini yozish shart.

---

### 4-bo'lim: Xavfsizlik bo'shlig'i — himoyasiz Admin metodi

**Muammo:** `member.resolver.ts`da:
```ts
// getAllMembersByAdmin — himoyalangan edi:
@Roles(MemberType.ADMIN)
@UseGuards(RolesGuard)
@Mutation(() => [Member])
public async getAllMembersByAdmin(...) {...}

// updateMemberByAdmin — HIMOYASIZ edi!
@Mutation(() => String)
public async updateMemberByAdmin(): Promise<string> {...}
```
`updateMemberByAdmin`da `@Roles`/`@UseGuards` **umuman yo'q** edi — bu degani, **tizimga kirmagan (autentifikatsiyasiz) har qanday odam** ham boshqa a'zolarning ma'lumotlarini o'zgartira olardi.

**Tuzatish:** Ikkala mutatsiyaga ham bir xil himoya qo'shildi:
```ts
@Roles(MemberType.ADMIN)
@UseGuards(RolesGuard)
@Mutation(() => Member)
public async updateMemberByAdmin(@Args('input') input: MemberUpdateInput): Promise<Member> {...}
```

**Saboq:** "Admin" nomli funksiya yozish — uni **avtomatik himoyalangan** qilmaydi. Har bir maxsus huquq talab qiladigan amal uchun Guard **alohida, qo'lda** qo'shilishi shart, aks holda nom shunchaki "yorliq" bo'lib qoladi, haqiqiy himoya bo'lmaydi.

---

### 5-bo'lim: Server barqarorligi — EADDRINUSE "tergov jarayoni"

Bu kunning **eng chuqur texnik voqeasi** edi — bosqichma-bosqich qanday tergov qilinganini ko'rsating:

**1-bosqich — Muammo qanday ko'rindi:**
```
[Nest] ... LOG [NestApplication] Nest application successfully started
[Nest] ... ERROR [NestApplication] Error: listen EADDRINUSE:
          address already in use :::3008
Node.js v20.20.2   <- butun jarayon qulab tushdi!
```
Server "muvaffaqiyatli ishga tushdi" deb yozib, DARHOL keyin qulab tushardi — bu chalkash edi, chunki xato ikkiga bo'linib ko'rinardi.

**2-bosqich — Birinchi gipoteza (chala to'g'ri):**
Avval bu "oddiy" holat deb o'ylandi — terminalda eski jarayon qolib ketgan, `lsof -ti:3008 | xargs kill` bilan tuzatildi. Bu **vaqtinchalik** yordam berdi, lekin muammo qaytaverdi.

**3-bosqich — Chuqur tekshiruv (`ps aux` orqali):**
`main.ts` faylga kichik o'zgarish kiritib (webpack `--watch` rejimini "qo'zg'atib"), **jarayonlar sonini kuzatildi**:
```
Tahrirlashdan oldin: 1 ta jarayon (PID 75712)
Tahrirlashdan keyin: 1 ta jarayon — lekin YANGI PID (75739)!
```
Bu shuni ko'rsatdi: fayl saqlanganda, NestJS CLI **eski jarayonni o'ldirib, yangisini ishga tushiradi** — lekin ular orasida portni bo'shatish uchun **millisoniyalar kerak**, va yangi jarayon buni kutmasdan darhol ulanishga urinib, qulab tushar edi.

**4-bosqich — Haqiqiy sabab (race condition — "poyga holati"):**
```
Vaqt:  0ms -------- eski jarayon o'chirilmoqda -------- ~50-200ms
                                                              |
Vaqt:  0ms -- yangi jarayon ishga tushdi, portga ulanmoqda --|
              (eski jarayon hali portni bo'shatmagan!)
              -> EADDRINUSE -> QULAB TUSHDI
```

**5-bosqich — Yechim (`main.ts`ga qayta urinish mexanizmi):**
```ts
async function listenWithRetry(app, port, retries = 20, delayMs = 500) {
  try {
    await app.listen(port);
  } catch (err) {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
      return listenWithRetry(app, port, retries - 1, delayMs);
    }
    throw err;
  }
}
```
Endi port band bo'lsa, dastur darhol qulab tushmaydi — 0.5 soniyadan 20 martagacha (10 soniyagacha) qayta urinib, eski jarayon portni bo'shatishini kutadi. Qo'shimcha `app.enableShutdownHooks()` ham eski jarayonning tezroq yopilishiga yordam berdi.

**6-bosqich — Natija tasdiqlandi:**
```
Tuzatishdan oldin: har bir fayl saqlashda 100% EADDRINUSE xatosi
Tuzatishdan keyin: bir nechta ketma-ket saqlashda ham 0 marta xato
```

**Bonus topilma:** Tergov paytida, avvalgi barcha test-urinishlardan **20 ta "zombi" (o'lik, lekin hali ishlab turgan) jarayon** kompyuterda yashirincha yig'ilib qolgani aniqlandi va tozalandi — chunki oddiy "portni tekshirish" usuli faqat **g'olib** jarayonni ko'rsatar edi, "mag'lub" (crash bo'lgan, lekin to'liq o'lmagan) jarayonlar ko'rinmay qolar edi.

**Saboq:** Ba'zida bitta xato xabari (`EADDRINUSE`) ortida **butunlay boshqa, chuqurroq muammo** yashiringan bo'ladi — "portni tozalash" kabi yuzaki yechim vaqtincha yordam bergani bilan, haqiqiy sababni (race condition) topmaguningizcha muammo qaytaveradi.

---

## 3-QISM: TAVSIYA ETILGAN QO'SHIMCHA CHARTLAR

1. **"Ikki qatlam" diagrammasi** — Mongoose Schema va GraphQL Type'ni ikkita alohida quti sifatida, ular orasida qo'lda sinxronlash kerakligini ko'rsatuvchi chizma (2-bo'lim uchun)
2. **"OLDIN/KEYIN" so'rov solishtirish jadvali** — Postman xatolarining barchasini bitta jadvalda, chap ustunda xato, o'ng ustunda to'g'ri versiya (3-bo'lim uchun)
3. **Guard himoyasi solishtirish sxemasi** — ikkita bir xil ko'rinishdagi mutatsiya, biri qulf belgisi bilan (himoyalangan), biri qulfsiz (himoyasiz) (4-bo'lim uchun)
4. **EADDRINUSE tergov timeline'i** — 5-bo'limdagi 6 bosqichni gorizontal vaqt chizig'ida, har biriga mos ikonka bilan (5-bo'lim uchun — bu eng muhim vizual, alohida e'tibor bering)
