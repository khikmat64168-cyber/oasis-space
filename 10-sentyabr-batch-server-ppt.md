# 10-sentyabr — Nestar Batch Server: PPT promptlar

> Bu fayl — 2026-09-10 kuni `nestar-batch` ilovasi (yangi, alohida NestJS ilovasi — cron/rejalashtirilgan vazifalar uchun) ustida qilingan ish bo'yicha taqdimot uchun slayd-promptlardan iborat. Barcha muhim kod bloklari **har bir qator yonida raqamlangan izoh** bilan berilgan — PPT'ga to'g'ridan-to'g'ri kesib joylashtirish mumkin.

---

## QISM 1: KIRISH

### Slayd 1 — Sarlavha

**Prompt:**
"Sarlavha slaydi yarat. Katta sarlavha: 'Nestar Batch Server'. Kichik sarlavha: '10-sentyabr, 2026 — Cron vazifalar, monorepo va NestJS modul integratsiyasi'."

---

### Slayd 2 — "Batch server" nima va nega alohida ilova

**Prompt:**
"Konseptual slayd yarat, ikkita quti bilan (nestar-api — doimiy ishlaydi, foydalanuvchi so'roviga javob beradi; nestar-batch — vaqti-vaqti bilan, avtomatik ishlaydi, hech kim so'ramasa ham). Sarlavha: 'Nega ikkinchi, alohida server kerak bo\'ldi'."

- **`nestar-api`** — foydalanuvchi so'rov yuborganda ishlaydigan (GraphQL) server
- **`nestar-batch`** — **hech kim so'ramasa ham**, belgilangan vaqtda (masalan har kuni tunda soat 01:00da) **avtomatik ishga tushadigan** server

**Nega kerak:** Masalan, "eng ko'p like bosilgan property'lar" reytingini har safar foydalanuvchi so'raganda hisoblash — **sekin va resurs talab qiladi**. Buning o'rniga, reyting **tunda, foydalanuvchilar uxlayotganda, oldindan hisoblab qo'yiladi** — ertalab esa foydalanuvchi tayyor natijani **darhol** oladi.

---

### Slayd 3 — Bugungi ish xulosasi

**Prompt:**
"Kontent slaydi yarat, 5 ta blok bilan. Sarlavha: 'Bugun bosib o\'tilgan yo\'l'."

1. **Loyiha tuzilishi xatolari** — `tsconfig`, import nomlari mos kelmasligi (server umuman ishga tushmasligiga sabab bo'lgan)
2. **`@Interval`/`ScheduleModule`** — vaqt bo'yicha ishlaydigan vazifalar nega "jim" turgan edi
3. **Monorepo cross-app import** — `nestar-batch`dan `nestar-api`ning kodini qanday ishlatish mumkin
4. **DI (Dependency Injection) xatosi** — `Property`/`Member` modellarini ro'yxatdan o'tkazish
5. **Haqiqiy biznes mantiq** — reyting (rank) hisoblash algoritmlari

---

## QISM 2: LOYIHA TUZILISHI XATOLARI

### Slayd 4 — Eng birinchi, eng chuqur xato: `outDir`

**Prompt:**
"Xato-ko'rsatish slaydi yarat, diagram bilan (ikkita papka qutisi, strelka noto'g'ri joyga ishora qiladi). Sarlavha: 'Server nega umuman ishga tushmadi'."

```
Error: Cannot find module '/Users/abcd/Desktop/nestar/dist/apps/nestar-api/main'
```

**Sabab** (`apps/nestar-batch/tsconfig.app.json`):
```json
{
  "compilerOptions": {
    "outDir": "../../dist/apps/nestar-api"    // ❌ boshqa ilovaning papkasiga yozilardi!
  }
}
```

Bu — `nestar-api`ning tsconfig faylidan **nusxa ko'chirib**, `outDir`ni yangilashni unutish natijasi. `nestar-batch`ni kompilyatsiya qilganda, natija **`nestar-api`ning papkasiga** yozilardi — server esa o'z joyidan o'zini topolmay yiqilardi.

**Tuzatish:**
```json
"outDir": "../../dist/apps/nestar-batch"    // ✅ o'z ilovasining papkasi
```

---

### Slayd 5 — Nom mos kelmasligi: import va class

**Prompt:**
"Ikki ustunli before/after kod slaydi yarat. Sarlavha: 'Default import vs Named import, va nom xatolari'."

**`batch.module.ts` — oldin:**
```ts
import BatchService from './batch.service';
// ❌ "default import" — lekin batch.service.ts'da default export YO'Q,
//    faqat "export class BatchService" (named export) bor
```

**`main.ts` — oldin:**
```ts
import { NestarBatchModule } from './batch.module';
// ❌ bunday nomli export yo'q — haqiqiy nomi "BatchModule"

const app = await NestFactory.create(NestarBatchModule);
await app.listen(process.env.port ?? 3000);
// ❌ "port" — kichik harf bilan (env o'zgaruvchilar katta harfda bo'ladi, PORT emas)
// ❌ standart qiymat 3000 — lekin bizga 3007 kerak edi
```

**Tuzatilgan holat:**
```ts
import { BatchService } from './batch.service';       // ✅ named import
import { BatchModule } from './batch.module';          // ✅ to'g'ri nom
const app = await NestFactory.create(BatchModule);
await app.listen(process.env.PORT_BATCH ?? 3007);      // ✅ to'g'ri env nomi va port
```

---

### Slayd 6 — `EADDRINUSE` — port band bo'lish tushunchasi

**Prompt:**
"Konseptual slayd yarat, bitta eshik va ikkita odam turgan diagram bilan ('port — faqat bitta jarayon egallay oladi'). Sarlavha: 'Bitta portni ikki marta \"egallab\" bo\'lmaydi'."

```
Error: listen EADDRINUSE: address already in use :::3007
```

**Tushuntirish:** Kompyuterdagi har bir "port" (masalan 3007) — bir vaqtning o'zida **faqat bitta dastur** tomonidan "tinglanishi" mumkin. Agar avvalgi server jarayoni **to'liq to'xtamagan** bo'lsa-yu, siz uni qayta ishga tushirsangiz — ikkinchi nusxa o'sha portni **band topadi** va xato beradi.

**Yechim:** Eski jarayonni **to'liq to'xtatish** (`Ctrl+C`, yoki kerak bo'lsa `lsof -i :3007` orqali topib, `kill` qilish), va shundan keyingina qayta ishga tushirish.

---

## QISM 3: `@Interval` VA `ScheduleModule`

### Slayd 7 — Nega "har sekund log" ishlamadi

**Prompt:**
"Xato-tushuntirish slaydi yarat. Sarlavha: '@Interval — dekorator yolg\'iz ishlamaydi'."

```ts
@Interval(1000)
handleInterval() {
  this.logger.debug('INTERNaL TEST ');
}
```

Bu kod **hech qanday xato bermaydi**, lekin ham **hech qachon ishlamaydi**. Sabab: `@Interval`/`@Cron`/`@Timeout` dekoratorlari — bu shunchaki **"belgilar" (metadata)**. Ularni haqiqiy `setInterval()`/cron job'ga aylantirib, ishga tushiradigan **alohida mexanizm** kerak — bu esa **`ScheduleModule`**.

---

### Slayd 8 — Fix: `ScheduleModule.forRoot()`

**Prompt:**
"Kod-fix slaydi yarat. Sarlavha: 'Bitta qator — hamma dekoratorni \"jonlantiradi\"'."

```ts
import { ScheduleModule } from '@nestjs/schedule';
// ↑ 1. kutubxonadan modulni olib kelish

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),   // ↑ 2. MUHIM QATOR: butun ilova bo'ylab @Cron/@Interval/@Timeout'larni
                                 //      "skanerlab", ularni haqiqiy vaqt-mexanizmiga ulaydi
    DatabaseModule,
  ],
})
export class BatchModule {}
```

**Natija:** `ScheduleModule.forRoot()` qo'shilgach, dastur ishga tushganda konsolda `[InstanceLoader] ScheduleModule dependencies initialized` degan qator chiqadi — bu, barcha vaqt-asosidagi vazifalar endi **"ro'yxatdan o'tgani va faollashgani"**ning belgisi.

---

## QISM 4: MONOREPO — BOSHQA ILOVANING KODINI ISHLATISH

### Slayd 9 — Monorepo va "bare import" nima

**Prompt:**
"Diagram slaydi yarat — bitta katta quti (monorepo), ichida ikkita kichik quti (nestar-api, nestar-batch), ular orasida strelka. Sarlavha: 'Bitta repo, ikkita ilova, umumiy kod'."

`nestar-api` va `nestar-batch` — **bitta monorepo** (`/Users/abcd/Desktop/nestar`) ichida, lekin **alohida ilovalar**. `nestar-batch`ga property/member'larning reytingini hisoblash uchun, `nestar-api`da allaqachon yozilgan **`Property`/`Member` DTO'lari va schema'lari** kerak — ularni **qaytadan yozish shart emas**, to'g'ridan-to'g'ri import qilish mumkin:

```ts
import { Property } from 'apps/nestar-api/src/libs/dto/member/property/property';
```

Bu — **nisbiy (`../../`) yo'l emas**, balki loyihaning ildiz papkasidan (`baseUrl: "./"`, `tsconfig.json`da belgilangan) boshlanadigan **"bare" import**.

---

### Slayd 10 — Topilgan 2 ta yo'l xatosi

**Prompt:**
"Before/after kod slaydi yarat, xato joylarini qizil bilan belgila. Sarlavha: 'Ikkita kichik, lekin butun so\'rovni yiqituvchi xato'."

```ts
// ❌ 4-qator (oldin):
import { Property } from '../../../../apps/nestar-api/src/libs/dto/property/property';
//                                                          ↑ "member/" segmenti tushib qolgan!
//        haqiqiy joylashuv: .../libs/dto/MEMBER/property/property.ts

// ❌ 5-qator (oldin):
import { MemberStatus, MemberType } from 'apps/nestar-api/src/libs/enums/member.enum';
//                                                                          ↑ "s" yetishmaydi!
//        haqiqiy fayl nomi: member.enumS.ts (ko'plik)
```

```ts
// ✅ Tuzatilgan (3-qatordagi ishlayotgan uslubga moslab):
import { Property } from 'apps/nestar-api/src/libs/dto/member/property/property';
import { MemberStatus, MemberType } from 'apps/nestar-api/src/libs/enums/member.enums';
```

**Saboq:** Fayl yo'lini qo'lda yozganda, **bitta harf yoki bitta papka nomi** yetishmasligi — butun modulni "topib bo'lmaydi" holatiga olib keladi.

---

### Slayd 11 — Keyingi qatlam: DI xatosi

**Prompt:**
"Xato-ko'rsatish slaydi yarat. Sarlavha: 'Import to\'g\'irlansa ham, yana bir bosqich qoladi'."

```
Nest can't resolve dependencies of the BatchService (?, MemberModel).
Please make sure that the argument "PropertyModel" at index [0] is available
in the BatchModule context.
```

**Tushuntirish:** `import`ning to'g'irlanishi — faqat **TypeScript'ga "bu tip qayerda"** deyish edi. Lekin `BatchService`ning konstruktori:
```ts
constructor(
  @InjectModel('Property') private readonly propertyModel: Model<Property>,
  @InjectModel('Member') private readonly memberModel: Model<Member>,
) {}
```
— bu yerda **runtime**da, NestJS'ning o'zi `'Property'` va `'Member'` nomli **modellarni topishi** kerak. Bu modellar esa hali **hech qayerda ro'yxatdan o'tkazilmagan** edi (`MongooseModule.forFeature` yo'q edi).

---

### Slayd 12 — Fix: cross-app schema'larni ro'yxatdan o'tkazish

**Prompt:**
"To'liq kod bloki slaydi yarat, qator-baqator izoh bilan. Sarlavha: 'batch.module.ts — modellarni ulash'."

```ts
import PropertySchema from 'apps/nestar-api/src/schema/Property.model';
// ↑ 1. nestar-api'da allaqachon yozilgan MongoDB schema'ni to'g'ridan-to'g'ri import qilish

import MemberSchema from 'apps/nestar-api/src/schema/Member.model';
// ↑ 2. xuddi shunday, Member uchun ham

@Module({
  imports: [
    ConfigModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    MongooseModule.forFeature([                        // 3. modellarni "ro'yxatga olish"
      { name: 'Property', schema: PropertySchema },     //    endi @InjectModel('Property') ishlaydi
      { name: 'Member', schema: MemberSchema },         //    endi @InjectModel('Member') ishlaydi
    ]),
  ],
})
export class BatchModule {}
```

**Natija:** Server toza ko'tarildi — `BatchModule dependencies initialized`, `Nest application successfully started`.

---

## QISM 5: HAQIQIY BIZNES MANTIQ — REYTING HISOBLASH

### Slayd 13 — "Rank" tizimi nima uchun kerak

**Prompt:**
"Konseptual slayd yarat. Sarlavha: 'Nega property\'larga va agentlarga \"reyting\" beriladi'."

Har bir property'da `propertyRank`, har bir agentda `memberRank` degan maydon bor. Bu — **"eng mashhur/eng sifatli"** deb hisoblangan property/agentlarni **birinchi o'ringa chiqarish** uchun ishlatiladi (masalan bosh sahifada "Top property'lar" bo'limi). Bu reyting — **like, ko'rish, e'lonlar soni** kabi ko'rsatkichlardan **avtomatik hisoblab chiqariladi**, qo'lda emas.

---

### Slayd 14 — `batchRollback` — to'liq kod, qator-baqator

**Prompt:**
"To'liq kod bloki slaydi yarat. Sarlavha: 'batchRollback — reytinglarni nolga qaytarish'."

```ts
public async batchRollback(): Promise<void> {

  await this.propertyModel
    .updateMany(                              // 1. BIR NECHTA hujjatni bir vaqtda yangilash
      {
        propertyStatus: PropertyStatus.ACTIVE,  // 2. faqat FAOL property'larni tanlash
      },
      { propertyRank: 0 },                      // 3. ularning propertyRank'ini 0'ga TUSHIRISH
    )
    .exec();

  await this.memberModel
    .updateMany(
      {
        memberStatus: MemberStatus.ACTIVE,      // 4. faqat FAOL a'zolarni
        memberType: MemberType.AGENT,           // 5. VA faqat AGENT turidagilarni tanlash
      },
      { memberRank: 0 },                        // 6. ularning memberRank'ini ham 0'ga tushirish
    )
    .exec();
}
```

**Vazifasi (bir jumlada):** Bu — **"tozalash" bosqichi**. Har safar reytingni qaytadan hisoblashdan oldin, eski reytinglarni **0'ga qaytarib**, "toza varaqdan" boshlanadi — aks holda eski reyting yangisiga qo'shilib, noto'g'ri natija chiqishi mumkin edi.

---

### Slayd 15 — `batchTopProperties` — to'liq kod, qator-baqator

**Prompt:**
"To'liq kod bloki slaydi yarat. Sarlavha: 'batchTopProperties — property reytingini hisoblash'."

```ts
public async batchTopProperties(): Promise<void> {

  const properties: Property[] = await this.propertyModel
    .find({
      propertyStatus: PropertyStatus.ACTIVE,    // 1. faqat faol property'lar
      propertyRank: 0,                          // 2. faqat HALI reytingi hisoblanmaganlar (0 — rollback qilinganlar)
    })
    .exec();

  const promiseList = properties.map(async (ele: Property) => {
    // ↑ 3. topilgan HAR BIR property uchun, alohida-alohida ish bajarish

    const { _id, propertyLikes, propertyViews } = ele;
    // ↑ 4. shu property'ning ID'si, like va view sonini ochib olish

    const rank = propertyLikes * 2 + propertyViews * 1;
    // ↑ 5. REYTING FORMULASI: har bir like — 2 ball, har bir view — 1 ball

    return await this.propertyModel.findByIdAndUpdate(_id, { propertyRank: rank });
    // ↑ 6. hisoblangan reytingni, shu property hujjatiga YOZIB QO'YISH
  });

  await Promise.all(promiseList);
  // ↑ 7. barcha property'lar uchun paralel ishlagan vazifalarning HAMMASI tugashini kutish
}
```

---

### Slayd 16 — Formula tahlili: `propertyLikes * 2 + propertyViews * 1`

**Prompt:**
"Vizual formula-tahlil slaydi yarat, tarozi (balans) belgisi bilan — bir tomonda 'Like = 2 ball', ikkinchi tomonda 'View = 1 ball'. Sarlavha: 'Nega like — view\'dan 2 baravar \"qimmat\"'."

- **`propertyLikes * 2`** — har bir like **2 ball** qo'shadi
- **`propertyViews * 1`** — har bir view (ko'rish) **1 ball** qo'shadi

**Mantiqiy sabab:** "Like bosish" — foydalanuvchidan **faol harakat** talab qiladi (u shunchaki ko'rmasdan, ataylab bosgan), "view" esa **passiv** (shunchaki ochib ko'rgan, xolos). Shuning uchun like — ko'proq "og'irlik (weight)" bilan hisoblanadi — bu, mashhurlikni **sifatliroq** o'lchash usuli.

**Misol:** Agar property 10 marta ko'rilgan va 3 marta like bosilgan bo'lsa:
```
rank = 3 × 2 + 10 × 1 = 6 + 10 = 16
```

---

### Slayd 17 — `batchTopAgents` — to'liq kod, qator-baqator

**Prompt:**
"To'liq kod bloki slaydi yarat. Sarlavha: 'batchTopAgents — agent reytingini hisoblash (murakkabroq formula)'."

```ts
public async batchTopAgents(): Promise<void> {

  const agents: Member[] = await this.memberModel
    .find({
      memberType: MemberType.AGENT,       // 1. faqat AGENT turidagilar
      memberStatus: MemberStatus.ACTIVE,  // 2. faqat faollar
      memberRank: 0,                      // 3. faqat hali hisoblanmaganlar
    })
    .exec();

  const promiseList = agents.map(async (ele: Member) => {
    const { _id, memberProperties, memberLikes, memberArticles, memberViews } = ele;
    // ↑ 4. agentning 4 ta ko'rsatkichini ochib olish:
    //      nechta property e'loni bor, nechta like yig'gan, nechta maqola yozgan, nechta ko'rilgan

    const rank = memberProperties * 4 + memberArticles * 3 + memberLikes * 2 + memberViews * 1;
    // ↑ 5. TO'RT XIL og'irlikdagi formula (property'nikidan murakkabroq)

    return await this.memberModel.findByIdAndUpdate(_id, { memberRank: rank });
    // ↑ 6. natijani agentning o'z hujjatiga yozish
  });

  await Promise.all(promiseList);
  // ↑ 7. hammasi tugashini kutish
}
```

---

### Slayd 18 — Agent formulasi: 4 xil og'irlik nega turlicha

**Prompt:**
"Zinapoya (staircase) diagram slaydi yarat, 4 ta pog'ona bilan: Property e'loni=4 ball (eng baland), Maqola=3, Like=2, View=1 (eng past). Sarlavha: 'Agentning \"qiymati\" nimalardan tashkil topadi'."

| Ko'rsatkich | Og'irlik | Mantiqiy sabab |
|---|---|---|
| **`memberProperties`** (property e'lonlari soni) | **× 4** (eng yuqori) | Agentning **asosiy vazifasi** — property joylashtirish, bu eng to'g'ridan-to'g'ri "faollik" belgisi |
| **`memberArticles`** (forum postlari) | **× 3** | Community'ga hissa qo'shish — qimmatli, lekin asosiy vazifa emas |
| **`memberLikes`** (olgan like'lar) | **× 2** | Boshqalarning tan olishi — foydali, lekin agentning o'zi to'g'ridan-to'g'ri boshqarolmaydi |
| **`memberViews`** (profil ko'rishlar) | **× 1** (eng past) | Eng "passiv" ko'rsatkich — shunchaki kimdir profilni ochib ko'rgan, xolos |

**Xulosa:** Formula — agentning **o'zi nazorat qila oladigan** harakatlarga (property joylashtirish, maqola yozish) **ko'proq og'irlik**, boshqalarning "passiv" harakatlariga (view) **kamroq og'irlik** beradi.

---

### Slayd 19 — `@Cron` — vaqt jadvalini o'qish

**Prompt:**
"Soat-diagram slaydi yarat, cron ifodasining har bir qismini alohida bo'lim sifatida ko'rsat. Sarlavha: 'Cron ifodasi — vaqtni qanday \"yoziladi\"'."

```ts
@Cron('00 00 01 * * *', { name: 'BATCH_ROLLBACK' })
```

Cron ifodasi — **6 ta bo'lim**dan iborat (chapdan o'ngga): **soniya, minut, soat, oyning kuni, oy, haftaning kuni**.

| Soniya | Minut | Soat | Oy kuni | Oy | Hafta kuni |
|---|---|---|---|---|---|
| `00` | `00` | `01` | `*` | `*` | `*` |

**O'qilishi:** "Har kuni (`*` — istalgan kun, istalgan oy, istalgan hafta kuni), soat **01:00:00**da ishga tush." Ya'ni — **har kecha, tunda soat birda**, avtomatik ishlaydi.

---

### Slayd 20 — Diqqat: topilgan kichik nomuvofiqlik

**Prompt:**
"'Diqqat qiling' formatidagi ogohlantiruvchi slayd yarat, sariq rang bilan. Sarlavha: 'Kod o\'qishda topilgan — uchala cron ham bitta metodni chaqiradi'."

```ts
@Cron('00 00 01 * * *', { name: 'BATCH_ROLLBACK' })
public async batchRollback() {
    await this.batchService.batchTopProperties();   // ❓ batchRollback() emas?
}

@Cron('20 00 01 * * *', { name: 'BATCH_TOP_PROPERTIES' })
public async batchProperties() {
    await this.batchService.batchTopProperties();   // ✅ bu to'g'ri
}

@Cron('30 00 01 * * *', { name: 'BATCH_TOP_AGENTS' })
public async batchAgents() {
    await this.batchService.batchTopProperties();    // ❓ batchTopAgents() emas?
}
```

**Kuzatuv:** Uchala `@Cron` handler ham (nomlari va vaqtlari turlicha bo'lsa ham) **bittasi (`batchTopProperties`)ni** chaqiradi. Bu — copy-paste qilinganda, ichidagi chaqiruvni har birida mosiga (`batchRollback()`, `batchTopAgents()`) almashtirishni unutish natijasi bo'lishi mumkin — kelgusi safar tekshirib ko'rish tavsiya etiladi.

---

## QISM 6: YAKUN

### Slayd 21 — Statistika

**Prompt:**
"Infographic slaydi yarat. Sarlavha: '10-sentyabr — bir kunlik ish yakunlari'."

| Ko'rsatkich | Son |
|---|---|
| Tuzatilgan konfiguratsiya xatolari (`outDir`, import nomlari) | 3 |
| Tuzatilgan modul-ulash xatolari (`ScheduleModule`, `MongooseModule.forFeature`) | 2 |
| Tuzatilgan cross-app import yo'l xatolari | 2 |
| Chuqurlashtirib o'qilgan biznes-mantiq metodlari | 3 (`batchRollback`, `batchTopProperties`, `batchTopAgents`) |
| Kod o'qishda topilgan potentsial nomuvofiqlik | 1 (3 ta cron, bitta metod) |

---

### Slayd 22 — Asosiy saboqlar

**Prompt:**
"Yakuniy saboqlar slaydi yarat, 5 ta karta bilan."

1. **Yangi ilova nusxa ko'chirib yaratilganda, HAR BIR konfiguratsiya qatorini tekshiring** — `outDir` kabi "ko'rinmas" sozlamalar butun serverni ishlamas holga keltirishi mumkin
2. **Dekorator (`@Cron`/`@Interval`) yolg'iz ishlamaydi** — uni "faollashtiruvchi" modul (`ScheduleModule.forRoot()`) har doim kerak
3. **Monorepo'da boshqa ilovaning kodini ishlatish mumkin**, lekin yo'l va fayl nomini **aniq** yozish kerak — bitta harf xato butun modulni "topib bo'lmaydi" holatiga olib keladi
4. **Import to'g'irlash — DI xatosini avtomatik hal qilmaydi** — runtime'da servis/model alohida **ro'yxatdan o'tkazilishi** kerak
5. **Formula og'irliklari (weight) — tasodifiy emas** — har bir ko'rsatkichga qancha "ball" berilishi, shu harakatning **qanchalik qiymatli/faol** ekanligini aks ettiradi

---

### Slayd 23 — Yakun

**Prompt:**
"Yopilish slaydi yarat, minimalistik. Sarlavha: 'Rahmat!'. Pastda: 'Barcha tuzatishlar TypeScript kompilyatsiyasi va real server ishga tushirish orqali tasdiqlangan.' Sana: '10-sentyabr, 2026'."
