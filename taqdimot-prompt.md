# Nestar loyihasi — taqdimot (PPT) yaratish uchun prompt

Bu faylning maqsadi: quyidagi matnni to'liq nusxalab, taqdimot yaratuvchi AI vositaga (Gamma, Tome, Beautiful.ai, Canva AI, yoki Claude/ChatGPT'ning "slides" rejimiga) bering — u sizga tayyor PPT tuzib beradi. Fayl ikki qismdan iborat: **(1) AI uchun buyruq (prompt)** va **(2) taqdimot uchun xom material** (voqealar, tushunchalar, diagramma tavsiyalari).

---

## 1-QISM: AI VOSITASIGA BERILADIGAN PROMPT

```
Men NestJS + GraphQL + MongoDB (Mongoose) texnologiyalari asosida qurilgan
"Nestar" nomli backend loyihasi ustida ishlayapman. Menga 15-18 slayddan
iborat, professional, ta'lim beruvchi (o'quv) uslubdagi taqdimot tuzib ber.

Auditoriya: dasturlashni o'rganayotgan, lekin NestJS/GraphQL bilan endi
tanishayotgan talaba/dasturchilar guruhi.
Ohang: sodda, tushunarli, texnik jargondan qochib, har bir atamani
kundalik hayotdan misol bilan tushuntiradigan.

Taqdimot quyidagi tuzilishda bo'lsin:

1. Sarlavha slaydi — "Nestar loyihasi: 12-13 avgust ish jarayoni va
   GraphQL arxitekturasi"
2. Kirish — loyiha nima, nima uchun NestJS + GraphQL + MongoDB tanlandi
   (1 slayd)
3. "12-13 avgustda nima qilindi" — pastdagi 2-QISM'dagi 17 ta muammo va
   yechimni 4-5 slaydga guruhlab joylashtir (masalan: "Loyihani ishga
   tushirish muammolari", "Paket va konfiguratsiya xatolari",
   "GraphQL schema xatolari", "Ma'lumotlar bazasi xatolari"). Har bir
   guruh uchun: muammo nima edi (oddiy tilda), nega yuz berdi, qanday
   tuzatildi — jadval yoki bullet-list ko'rinishida.
4. "GraphQL nima?" — 2-QISM'dagi tushuntirishga asoslanib, GraphQL'ni
   REST bilan solishtirib, oddiy diagram bilan tushuntir (1-2 slayd)
5. "So'rov qanday yo'l bosib o'tadi: Client → Resolver → Service →
   Schema → Database" — oqim diagrammasi (flow chart) bilan, har bir
   bosqichda nima sodir bo'lishini tushuntir (2 slayd, diagramma majburiy)
6. "Resolver, Service, Schema — kim nima qiladi?" — 3 ta katakchali
   solishtirma jadval (har birining vazifasi, misol kod, real hayotdan
   o'xshatish) (1-2 slayd)
7. "Guard va Pipe nima farq qiladi?" — solishtirma jadval + oqim
   diagrammasi (so'rov Guard'dan, keyin Pipe'dan o'tib, keyin
   Resolver'ga yetib borishi) (1-2 slayd)
8. "Bugungi holat" — nima ishlayapti (signup, login, validatsiya)
9. "Keyingi qadamlar" — parolni hash qilish (bcrypt), JWT autentifikatsiya,
   Guard qo'shish kabi keyingi bosqichlar
10. Yakuniy slayd — xulosa va savollar

MUHIM: Quyidagi 3 ta diagrammani albatta grafik/chart ko'rinishida chiz:
1. Xatolar xronologiyasi — timeline/vertikal jarayon diagrammasi
   (3-QISM'dagi ma'lumot asosida)
2. GraphQL so'rov oqimi — Client → Resolver → Service → Schema →
   MongoDB flow chart (4-QISM'dagi tuzilma asosida)
3. Guard/Pipe/Resolver ketma-ketligi — chapdan o'ngga strelka bilan
   ulangan bosqichlar diagrammasi (5-QISM asosida)

Har bir texnik atama birinchi marta ishlatilganda, qavs ichida oddiy
tilda 1 jumlali izoh ber. Kod namunalarini faqat zarur joyda, qisqa
(3-5 qatordan oshmasin) qo'sh.
```

---

## 2-QISM: 12-13 AVGUST ISH JARAYONI — MUAMMOLAR VA YECHIMLAR

### A. Loyihani ishga tushirish muammolari

| # | Muammo (sodda tilda) | Sabab | Yechim |
|---|---|---|---|
| 1 | `npm run start:dev` va `npm run start:prod` ishlamadi — "main.ts topilmadi" xatosi | Loyiha nomi `nestar`dan `nestar-api`ga o'zgartirilgan, lekin `main.ts`, `app.module.ts` kabi asosiy fayllar hali eski `apps/nestar` papkasida qolib ketgan edi | Barcha fayllarni `apps/nestar-api`ga ko'chirdik, `nest-cli.json` va `tsconfig.app.json`dagi yo'llarni tuzatdik |
| 2 | GraphQL ishga tushmadi — `@as-integrations/express5` paketi topilmadi | Kerakli paket `package.json`da yo'q edi | Paketni o'rnatdik (`npm install @as-integrations/express5`) |
| 3 | `start:prod`da ham, `start:dev`da ham konsolda doim "development" chiqardi | `NODE_ENV` o'zgaruvchisi hech qaysi skriptda belgilanmagan edi | `cross-env` paketi bilan har bir skriptga `NODE_ENV=development` yoki `NODE_ENV=production` qo'shdik |

### B. Paket va TypeScript konfiguratsiya xatolari

| # | Muammo | Sabab | Yechim |
|---|---|---|---|
| 4 | `Cannot find module 'class-validator'` | Validatsiya uchun ishlatilayotgan paket o'rnatilmagan edi | `class-validator` va `class-transformer` paketlarini o'rnatdik |
| 5 | IDE'da xatolar paket o'rnatilgandan keyin ham ketmadi | VSCode'ning TypeScript serveri eski holatni keshlab saqlab qolgan edi | "Restart TS Server" / "Reload Window" orqali serverni qayta ishga tushirdik |
| 6 | `ObjectId` importi bilan bog'liq `TS1272` xatosi | Loyihada `isolatedModules` sozlamasi yoqilgani uchun faqat tur (type) sifatida ishlatiladigan importlar `import type` bilan yozilishi shart edi | `import type { ObjectId } from 'mongoose'` qilib tuzatdik |

### C. GraphQL/Resolver/Service kod xatolari

| # | Muammo | Sabab | Yechim |
|---|---|---|---|
| 7 | `member.resolver.ts` butunlay build bo'lmasdi | Ortiqcha yopilgan qavs `}` klassni muddatidan oldin yopib qo'yган, ba'zi joylarda `;` o'rniga `,` yozilgan, bitta metod nomi joyida band so'z `new` ishlatilgan edi | Qavslarni, tinish belgilarini va metod nomini (`getMember`) tuzatdik |
| 8 | `MissingSchemaError: Schema hasn't been registered for model "Member"` | `member.module.ts`da Mongoose modeliga faqat nom berilgan, uning sxemasi (schema) ulanmagan edi | Tayyor `MemberSchema`ni import qilib, `forFeature`ga qo'shdik |
| 9 | Signup qilganda: `Cannot return null for non-nullable field Member._id` | Resolver GraphQL'ga "men to'liq Member obyektini qaytaraman" deb va'da bergan (`@Mutation(() => Member)`), lekin service faqat `_id`ning matn (string) ko'rinishini qaytarardi | Service va resolverni to'liq yaratilgan Member hujjatini qaytaradigan qilib tuzatdik |
| 10 | Kelajakda xato berishi mumkin bo'lgan `memberImage` maydoni | GraphQL'da bu maydon "majburiy" (`non-nullable`) deb belgilangan, lekin Mongoose sxemasida bunday maydon umuman yo'q edi | `{ nullable: true }` qo'shib oldini oldik |
| 11 | Postman/Playground'da `login`dan keyin `memberType`, `memberStatus` kabi maydonlarni tanlab bo'lmasdi | `login` mutatsiyasi GraphQL schema'da "String qaytaraman" deb e'lon qilingan edi, aslida esa to'liq Member obyekti qaytarayotgan edi | `@Mutation(() => Member)` qilib to'g'irladik |

### D. Ma'lumotlar bazasi va konfiguratsiya xatolari

| # | Muammo | Sabab | Yechim |
|---|---|---|---|
| 12 | `E11000 duplicate key error` — signup qayta-qayta xato berardi | Bu aslida **kutilgan xatti-harakat**: bir xil telefon raqami/nickname bilan ikkinchi marta ro'yxatdan o'tishga urinilgan, unique-indeks himoyasi to'g'ri ishlagan | Xato xabarini aniqroq qildik: `"Member already exists with this phone number or nickname"` |
| 13 | Postman schema yangilanmasdi, faqat 2 ta eski maydon (`memberNick`, `memberPassword`) ko'rinardi | `.env` faylida `PORT_API` ikki marta yozilgan edi (3007 va 3008); server 3008-portda ishlar, Postman esa 3007-ga so'rov yuborardi | Dublikat qatorni olib tashladik, `.env`ni server ishlayotgan portga (3008) moslashtirdik |
| 14 | Terminalda konsolga g'alati "reklama" xabari chiqdi (`vestauth.com`) | `dotenv` paketining rasmiy (zararsiz, lekin spam) reklama xususiyati ekanligi tekshirilib tasdiqlandi | Zararli emasligini aniqladik, hech qanday havolaga o'tilmadi |

### Hali qilinmagan (keyingi bosqich)

- **Parolni hash qilish** — hozircha parol bazaga ochiq matn (plain text) holida saqlanyapti. Bu ishlab chiqarish (production) uchun jiddiy xavfsizlik muammosi — keyingi bosqichda `bcrypt` bilan tuzatilishi kerak.
- **Guard va JWT autentifikatsiya** — hozircha loyihada haqiqiy Guard ishlatilmayapti, faqat `ValidationPipe` bor.

---

## 3-QISM: GRAPHQL NIMA VA QANDAY ISHLAYDI (sodda tushuntirish)

**GraphQL** — bu API bilan gaplashish usuli (til). Uni restoranga taqqoslash mumkin:

- **REST API** — bu "kompleks tushlik" kabi: siz faqat tayyor menyudan (masalan `/users/5`) buyurtma berasiz va sizga STOL TO'LA taom (barcha maydonlar: ism, familiya, email, manzil, tug'ilgan sana...) keladi — kerak-keraksiz hammasi.
- **GraphQL** — bu "o'zingiz tanlab oladigan bufet" kabi: siz aynan nima kerakligini aytasiz ("menga faqat ism va email kerak"), va serverdan faqat o'sha ikkitasi keladi — ortiqcha narsa yo'q.

**Ikkita asosiy amal:**
- **Query** — ma'lumot **o'qish** uchun (masalan: `getMember` — a'zo ma'lumotini olish)
- **Mutation** — ma'lumotni **o'zgartirish** uchun (masalan: `signup`, `login` — yangi yozuv yaratish yoki holatni o'zgartirish)

**GraphQL Playground/Postman** — bu shu so'rovlarni yozib sinab ko'radigan "sinov maydonchasi" (biz loyihada `localhost:3008/graphql` orqali foydalandik).

---

## 4-QISM: SO'ROV YO'LI — CLIENT → RESOLVER → SERVICE → SCHEMA → DATABASE

```
[ Client / Postman ]
        |
        |  1. GraphQL so'rov yuboradi
        |     (masalan: signup(input: {...}))
        v
[ Resolver ]  --- "qabul qiluvchi" kabi
        |
        |  2. Qaysi funksiya chaqirilishini aniqlaydi,
        |     kelgan ma'lumotni (input) qabul qiladi
        v
[ Service ]  --- "ish bajaruvchi" kabi
        |
        |  3. Haqiqiy ishni bajaradi: ma'lumotni
        |     tekshiradi, bazaga yozadi/o'qiydi
        v
[ Schema (Mongoose Model) ]  --- "qolip/andoza" kabi
        |
        |  4. Ma'lumot qanday shaklda saqlanishini
        |     belgilaydi (qaysi maydon majburiy,
        |     qaysi turdan bo'lishi kerak)
        v
[ MongoDB ]  --- "ombor" kabi
        |
        |  5. Ma'lumot jismonan saqlanadi
        v
   (natija yana yuqoriga — Service → Resolver → Client
    orqali qaytadi)
```

**Har birining vazifasi (Nestar loyihasidagi haqiqiy misol bilan):**

| Qism | Vazifasi | Nestar loyihasidagi fayl |
|---|---|---|
| **Resolver** | GraphQL so'rovini qabul qiladi, kerakli Service metodini chaqiradi, natijani qaytaradi. O'zi hech qanday "og'ir" ish qilmaydi — faqat yo'naltiradi | `member.resolver.ts` |
| **Service** | Haqiqiy biznes-logika shu yerda: parolni tekshirish, bazaga yozish, xatoliklarni ushlash | `member.service.ts` |
| **Schema (2 xil ma'noda)** | 1) GraphQL Schema — qaysi maydonlar tashqariga (API'ga) ko'rinishini belgilaydi (`member.ts`, `member.input.ts`); 2) Mongoose Schema — ma'lumot bazasida qanday saqlanishini belgilaydi (`Member.model.ts`) | `member.ts`, `member.input.ts`, `Member.model.ts` |

---

## 5-QISM: GUARD VA PIPE — FARQI NIMADA?

Ikkalasi ham so'rov **Resolver'ga yetib borishidan OLDIN** ishlaydi, lekin vazifalari boshqacha:

| | **Pipe** | **Guard** |
|---|---|---|
| Savoli | "Bu ma'lumot **to'g'rimi**?" | "Bu odamga **ruxsat bormi**?" |
| Vazifasi | Kiruvchi ma'lumotni tekshiradi va/yoki o'zgartiradi (validatsiya, transformatsiya) | Foydalanuvchi kirishga haqlimi-yo'qmi, tekshiradi (autentifikatsiya/avtorizatsiya) |
| Nestar'dagi misol | `@UsePipes(ValidationPipe)` — `@IsNotEmpty()`, `@Length(3, 12)` kabi qoidalarni tekshiradi (masalan: `memberNick` kamida 3, ko'pi bilan 12 belgidan iborat bo'lishi kerak) | Hozircha loyihada ishlatilmagan — keyingi bosqichda JWT token orqali "faqat tizimga kirgan foydalanuvchi kira oladi" qoidasini qo'shish uchun kerak bo'ladi |
| O'xshatish | Bank kassiri — to'ldirgan blankangizni tekshiradi, xato bo'lsa qaytaradi | Bank eshigidagi qorovul — ichkariga faqat ruxsati borlarni kiritadi |

**Ketma-ketlik (so'rov qanday tekshiruvlardan o'tadi):**

```
[ So'rov keladi ]
      v
[ Guard ]  -->  Ruxsat yo'q bo'lsa: RAD ETILADI (401/403 xato)
      v  (ruxsat bor)
[ Pipe ]   -->  Ma'lumot noto'g'ri bo'lsa: RAD ETILADI (400 xato)
      v  (ma'lumot to'g'ri)
[ Resolver ]  -->  Ishga tushadi
```

---

## 6-QISM: TAVSIYA ETILGAN CHARTLAR (taqdimot uchun)

Taqdimot yaratuvchi AI vositaga quyidagi 3 ta vizual elementni **albatta** chizishni so'rang:

1. **Xatolar xronologiyasi (timeline chart)** — 2-QISM'dagi 14 ta muammoni vaqt chizig'i (timeline) ko'rinishida, kategoriyalar bo'yicha rangli belgilab (Loyihani ishga tushirish = ko'k, Paket xatolari = sariq, GraphQL xatolari = qizil, Baza xatolari = yashil)
2. **So'rov oqimi diagrammasi (flow chart)** — 4-QISM'dagi `Client → Resolver → Service → Schema → MongoDB` zanjiri, har bir bosqichda nima sodir bo'lishini ko'rsatuvchi qisqa izoh bilan
3. **Guard/Pipe ketma-ketligi diagrammasi** — 5-QISM'dagi uch bosqichli (`Guard → Pipe → Resolver`) oqim, har birida "rad etilishi mumkin" shoxobchasi bilan
