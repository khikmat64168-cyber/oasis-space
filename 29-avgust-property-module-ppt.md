# 29-avgust — Property moduli: kengaytirilgan PPT promptlar

> Bu fayl — 2026-08-29 kuni `nestar-api` loyihasining **Property (mulk) moduli** ustida qilingan ish bo'yicha **to'liq va tushunarli** taqdimot (PPT) tayyorlash uchun slayd-promptlardan iborat. Har bir slayd o'z ichiga oladi: **sarlavha, tushuntirish, kod namunasi (agar kerak bo'lsa) va PPT generator uchun tayyor prompt**. Slaydlar shunday tuzilganki, mavzuni umuman bilmagan odam ham tushunib ketishi mumkin.

---

## QISM 1: KIRISH VA FON

### Slayd 1 — Sarlavha

**Prompt:**
"Sarlavha slaydi yarat. Katta sarlavha: 'Nestar API — Property Moduli'. Kichik sarlavha: '29-avgust, 2026 — GraphQL API\'lar, xatolar va debugging jarayoni'. Fon: dasturlash mavzusidagi minimalistik dizayn, ko'k-binafsha gradient."

---

### Slayd 2 — Taqdimot rejasi (Agenda)

**Prompt:**
"Agenda slaydi yarat, 4 ta bo'lim bilan (ro'yxat ko'rinishida, har biriga ikonka)."

1. **Fon bilim** — GraphQL va loyiha arxitekturasi haqida qisqacha
2. **Yaratilgan API'lar** — Property moduli qanday ishlaydi
3. **Topilgan xatolar** — 6 ta xato, sabab va yechimlari
4. **Saboqlar** — kelajakda shunga o'xshash xatolardan qochish

---

### Slayd 3 — GraphQL nima (tezkor eslatma)

**Prompt:**
"Tushuntirish slaydi yarat, chap tomonda REST, o'ng tomonda GraphQL taqqoslash jadvali bilan. Sarlavha: 'GraphQL — tezkor eslatma'."

- **REST**: har bir amal uchun alohida URL (`/properties`, `/properties/:id`, `/properties/create` ...)
- **GraphQL**: bitta URL (`/graphql`), lekin so'rov ichida **aynan qaysi maydonlar kerakligini** siz belgilaysiz
- Ikkita asosiy amal turi:
  - **Query** — ma'lumot o'qish (masalan `getProperty`)
  - **Mutation** — ma'lumotni o'zgartirish (masalan `createProperty`, `updateProperty`)

---

### Slayd 4 — Loyiha arxitekturasi: so'rov qanday yo'l bosib o'tadi

**Prompt:**
"Diagram slaydi yarat — chapdan o'ngga oqim: Client (Postman) → Guard → Resolver → Service → Mongoose Model → MongoDB, va orqaga qaytish strelkasi. Sarlavha: 'Bitta so\'rovning hayot yo\'li'."

1. **Client** (Postman/frontend) — GraphQL so'rov yuboradi
2. **Guard** (`AuthGuard`/`RolesGuard`/`WithoutGuard`) — kim so'rov yuborayotganini tekshiradi
3. **Resolver** (`property.resolver.ts`) — so'rovni qabul qiladi, qaysi metodga yo'naltirishni hal qiladi
4. **Service** (`property.service.ts`) — asosiy biznes-mantiq shu yerda
5. **Model** (Mongoose, `Property.model.ts`) — MongoDB bilan bevosita ishlaydi
6. Natija orqaga — **Model → Service → Resolver → Client**

---

## QISM 2: PROPERTY MODULI — YARATILGAN API'LAR

### Slayd 5 — Property moduli: umumiy ko'rinish

**Prompt:**
"Statistika-uslubidagi slayd yarat, katta raqamlar bilan. Sarlavha: 'Property moduli raqamlarda'."

- **8 ta** GraphQL API (`property.resolver.ts`)
- **3 ta** DTO (Data Transfer Object) fayli — kirish/chiqish ma'lumot shakllari
- **3 ta** foydalanuvchi roli qamrab olingan: **oddiy foydalanuvchi** (login shart emas), **AGENT**, **ADMIN**

---

### Slayd 6 — API #1: `createProperty` — vazifasi

**Prompt:**
"API tavsif slaydi yarat, katta ikonka bilan (uy/bino belgisi). Sarlavha: 'createProperty — Yangi e\'lon yaratish'."

- **Turi:** Mutation
- **Kimga ochiq:** faqat **AGENT** (`@Roles(MemberType.AGENT)` + `RolesGuard`)
- **Nima qiladi (oddiy tilda):** Agent yangi uy/kvartira e'lonini kiritganda, bu funksiya:
  1. Kiritilgan ma'lumotni (narx, manzil, xonalar soni va h.k.) MongoDB'ga yozadi
  2. Shu agentning "nechta property e'loni bor" hisoblagichini bittaga oshiradi

---

### Slayd 7 — API #1: `createProperty` — kod va xavfsizlik nuqtasi

**Prompt:**
"Kod-ko'rsatish slaydi yarat, syntax-highlighted kod bloki bilan. Sarlavha: 'createProperty — kod ichida nima bo\'lyapti'."

```ts
public async createProperty(input: PropertyInput): Promise<Property> {
    const result = await this.propertyModel.create(input);
    // Agentning "memberProperties" hisoblagichini +1 oshirish
    await this.memberService.memberStatsEditor({
        _id: result.memberId,
        targetKey: 'memberProperties',
        modifier: 1,
    });
    return result;
}
```

**Muhim xavfsizlik detali:** `input.memberId` — client tomonidan yuborilmaydi, balki resolver darajasida **JWT token'dan** (`@AuthMember('_id')`) olinadi. Bu — birov boshqa agent nomidan e'lon yaratib qo'ymasligi uchun.

---

### Slayd 8 — API #2: `getProperty` — vazifasi

**Prompt:**
"API tavsif slaydi yarat, ko'z ikonkasi bilan. Sarlavha: 'getProperty — Bitta e\'lonni ko\'rish va \"views\" hisoblash'."

- **Turi:** Query
- **Kimga ochiq:** hammaga (`WithoutGuard` — login shart emas, lekin login qilingan bo'lsa qo'shimcha imkoniyat bor)
- **Nima qiladi:**
  1. Berilgan `_id` bo'yicha property'ni topadi (faqat **faol** (`ACTIVE`) statusdagilarni)
  2. Agar foydalanuvchi **login qilgan bo'lsa**, uning bu property'ni "ko'rgani"ni maxsus jadvalga (`View`) yozadi
  3. Agar bu **birinchi marta ko'rish** bo'lsa (oldin yozilmagan bo'lsa) — `propertyViews` sonini bittaga oshiradi
  4. Property bilan birga, uning **egasi (agent)ning to'liq profilini** ham qo'shib qaytaradi (`memberData`)

---

### Slayd 9 — API #2: nega "view" hisoblash murakkab?

**Prompt:**
"Tushuntirish slaydi yarat, savol-javob formatida. Sarlavha: 'Nega har bir ko\'rishni oddiy +1 qilib bo\'lmaydi?'."

**Savol:** Agar foydalanuvchi bitta property'ni 10 marta yangilab ko'rsa, `propertyViews` 10 marta oshishi kerakmi?

**Javob:** Yo'q — shuning uchun avval `recordView()` chaqiriladi, u "bu foydalanuvchi bu property'ni oldin ko'rganmi?" deb tekshiradi. Agar **yangi** ko'rish bo'lsa (`newView === true`) — faqat o'shanda `propertyViews++` qilinadi. Bu — real ijtimoiy tarmoqlar (Instagram, YouTube) qanday "unique view" hisoblashiga o'xshash mantiq.

---

### Slayd 10 — Qolgan 6 ta API (jadval)

**Prompt:**
"To'liq jadval slaydi yarat, ranglar bilan rol darajasini ko'rsat (yashil=hammaga ochiq, sariq=AGENT, qizil=ADMIN). Sarlavha: 'Property moduli — to\'liq API xaritasi'."

| # | API nomi | Turi | Kim uchun | Vazifasi |
|---|---|---|---|---|
| 3 | `updateProperty` | Mutation | AGENT | O'z e'lonini qisman yangilash (masalan faqat narxni o'zgartirish) |
| 4 | `getProperties` | Query | Hammaga ochiq | Filtr (narx, joylashuv, xona soni) va sahifalash bilan barcha e'lonlarni ro'yxatlash |
| 5 | `getAgentProperties` | Query | AGENT | Faqat login qilgan agentning o'z e'lonlarini ko'rish |
| 6 | `getAllPropertiesByAdmin` | Query | ADMIN | Barcha e'lonlarni, holatidan qat'iy nazar (hatto o'chirilganlarini ham) ko'rish |
| 7 | `updatePropertyByAdmin` | Mutation | ADMIN | Istalgan agentning e'lonini administrator huquqi bilan tahrirlash |
| 8 | `removePropertyByAdmin` | Mutation | ADMIN | E'lonni butunlay bazadan o'chirish |

---

## QISM 3: TOPILGAN XATOLAR — CHUQUR TAHLIL

### Slayd 11 — Bugungi xatolar xaritasi

**Prompt:**
"Roadmap/timeline slaydi yarat, 6 ta bosqich bilan (chapdan o'ngga strelkalar). Sarlavha: 'Bugun bosib o\'tgan 6 ta xato'."

1. TypeScript tip xatosi (`propertyViews`)
2. TypeScript `null` xatosi (`getMember`)
3. Postman Variables aralashuvi (#1)
4. Postman Variables aralashuvi (#2)
5. Yashiringan "shadowing" bug (eng murakkabi)
6. Academy testida `createdAt` yetishmasligi

---

### Slayd 12 — Xato #1: nima sodir bo'ldi

**Prompt:**
"Xato-ko'rsatish slaydi yarat, qizil xato ramkasi bilan. Sarlavha: 'Xato #1 — TypeScript kompilyatsiya to\'xtadi'."

**Xato matni:**
```
An arithmetic operand must be of type 'any', 'number', 'bigint' or an enum type.
```

**Qayerda:** `property.service.ts` — `targetProperty.propertyViews++;` qatorida

---

### Slayd 13 — Xato #1: sabab tushuntirilishi

**Prompt:**
"Before/after kod solishtirish slaydi yarat, chapda qizil (xato), o'ngda yashil (to'g'ri). Sarlavha: 'Sabab — noto\'g\'ri tanlangan tip'."

**Muammo:** `Property` GraphQL tipida (`property.ts`):
```ts
// ❌ Oldin — noto'g'ri
@Field(() => String)
propertyViews!: string;
```

Lekin MongoDB'da (`Property.model.ts`) bu maydon **son** sifatida saqlanadi:
```ts
propertyViews: { type: Number, default: 0 }
```

`++` (increment) operatori faqat **sonlar** uchun ishlaydi — `string`ga qo'llab bo'lmaydi.

---

### Slayd 14 — Xato #1: yechim

**Prompt:**
"Yechim slaydi yarat, yashil belgi bilan. Sarlavha: 'Yechim — tipni to\'g\'irlash'."

```ts
// ✅ Keyin — to'g'ri
@Field(() => Int)
propertyViews!: number;
```

**Saboq:** GraphQL entity'dagi har bir maydon tipi, MongoDB schema'dagi haqiqiy ma'lumot turi bilan **aniq mos kelishi** shart.

---

### Slayd 15 — Xato #2: nima sodir bo'ldi

**Prompt:**
"Xato-ko'rsatish slaydi yarat. Sarlavha: 'Xato #2 — null qiymatga ruxsat berilmagan'."

**Xato matni:**
```
Argument of type 'null' is not assignable to parameter of type 'ObjectId'.
```

**Qayerda:** `property.service.ts` — `this.memberService.getMember(null, targetProperty.memberId)` chaqirilganda

---

### Slayd 16 — Xato #2: sabab va "TypeScript strict mode" tushunchasi

**Prompt:**
"Tushuntirish slaydi yarat, 'nega TypeScript bunga qarshi?' formatida. Sarlavha: 'TypeScript nega bunchalik qattiqqo\'l?'."

- Login qilmagan foydalanuvchi property'ni ko'rganda, uning `memberId`si **yo'q** — shuning uchun kodda `null` yuboriladi (bu **to'g'ri va kutilgan** holat)
- Lekin `getMember` funksiyasi `memberId: ObjectId` deb e'lon qilingan edi — ya'ni "bu doim mavjud bo'lishi kerak" deb va'da bergan
- TypeScript bu va'dani buzilishini oldindan payqab, kompilyatsiyani to'xtatadi — bu **yordam**, xalaqit emas: u sizni potentsial runtime xatodan ogohlantiradi

---

### Slayd 17 — Xato #2: yechim

**Prompt:**
"Yechim slaydi yarat. Sarlavha: 'Yechim — haqiqatni tipda aks ettirish'."

```ts
// ✅ Keyin
public async getMember(memberId: ObjectId | null, targetId: ObjectId): Promise<Member> {
```

**Muhim:** Funksiya ichida allaqachon `if (memberId) { ... }` bor edi — ya'ni **mantiq to'g'ri edi**, faqat tip e'loni haqiqatni aks ettirmagan edi. Fix — kodni emas, faqat tipni to'g'irladi.

---

### Slayd 18 — Xato #3-4: Postman haqida tez ma'lumot

**Prompt:**
"Konseptual slayd yarat, Postman interfeysi diagrammasi bilan (Query tab, Variables panel). Sarlavha: 'Postman: har bir so\'rov o\'z Variables\'iga ega'."

- Postman'da bitta collection ichida **bir nechta so'rov (tab)** saqlanishi mumkin (masalan `GetProperties`, `UpdateProperty`, `CreateProperty`)
- Har bir tab — **o'zining alohida Variables** to'plamiga ega bo'lishi kerak
- Lekin agar siz Variables'ni **nusxalab, boshqa tab'ga joylashtirsangiz** (yoki eskisini o'chirishni unutsangiz) — noto'g'ri ma'lumot boshqa so'rovga "sizib kirishi" mumkin

---

### Slayd 19 — Xato #3-4: aynan nima bo'ldi

**Prompt:**
"Xato-ko'rsatish slaydi yarat, ikkita misol bilan. Sarlavha: 'Ikki marta bir xil sabab bilan xato'."

**1-holat:** `GetProperty` so'rovida `$input: String!` kutilgan, lekin Variables **butunlay bo'sh** qoldirilgan:
```
Variable "$input" of required type "String!" was not provided.
```

**2-holat:** `UpdateProperty` so'rovida `$input: PropertyUpdate!` kutilgan, lekin Variables'da `GetProperties`ning eski qiymatlari (`page`, `limit`, `sort`) qolib ketgan:
```
Field "sort" is not defined by type "PropertyUpdate".
```

**Ikkalasi ham — kod xatosi emas, Postman sozlamasidagi e'tiborsizlik.**

---

### Slayd 20 — Xato #5: kirish — "imkonsiz" bug

**Prompt:**
"Dramatik kirish slaydi yarat, katta savol belgisi bilan. Sarlavha: 'Xato #5 — Qiymat to\'g\'ri, lekin baribir rad etiladi?!'."

**Vaziyat:** `sort: "propertyRank"` yuborilgan — bu qiymat `config.ts` faylida **aniq mavjud**. Lekin server baribir rad etadi:
```
sort must be one of the following values: createdAt, propertyPrice, propertySquare
```

Bu ro'yxatda `"propertyRank"` **umuman yo'q**! Xo'sh, qayerdan bu boshqa ro'yxat paydo bo'ldi?

---

### Slayd 21 — Xato #5: tergov jarayoni (1-qadam)

**Prompt:**
"Detektiv-uslubidagi jarayon slaydi yarat, lupa ikonkasi bilan. Sarlavha: 'Tergov: birinchi urinishlar yetarli bo\'lmadi'."

1. **Server konsoli tekshirildi** — lekin xato matni `message: [Array]` deb qisqartirilgan edi (Node.js'ning `console.log` chuqurlik chegarasi tufayli haqiqiy tafsilotlar ko'rinmadi)
2. **`curl` orqali to'g'ridan-to'g'ri so'rov yuborildi** — bu ham faqat umumiy `"Bad Request Exception"` qaytardi, chunki serverning `formatError` funksiyasi xavfsizlik uchun tafsilotlarni yashiradi

---

### Slayd 22 — Xato #5: tergov jarayoni (2-qadam — hal qiluvchi)

**Prompt:**
"Kod bloki bilan slayd yarat. Sarlavha: 'Yechim: mustaqil debug skript yozish'."

Muammoni chindan hal qilish uchun, loyihaning **o'zidan tashqarida**, kichik alohida skript yozildi — u `class-validator`ning tekshirish funksiyasini to'g'ridan-to'g'ri chaqirib, **to'liq** xato ma'lumotini ko'rsatdi:

```ts
const instance = plainToInstance(PropertiesInquiry, { sort: 'propertyRank', ... });
const errors = await validate(instance);
console.log(JSON.stringify(errors, null, 2));
```

**Natija:** Aynan qaysi qoida (`constraint`) va qaysi qiymat sabab bo'layotgani **to'liq** ko'rindi.

---

### Slayd 23 — Xato #5: haqiqiy sabab — "Shadowing"

**Prompt:**
"Konseptual diagram slayd yarat — ikkita quti, bir xil yorliq ('availablePropertySorts'), lekin ichida turli qiymatlar. Sarlavha: 'Shadowing — bir xil nom, ikki xil haqiqat'."

`property.input.ts` faylining o'zida, **mahalliy** (`local`) o'zgaruvchi e'lon qilingan edi:
```ts
// property.input.ts — bu yerda, mustaqil ravishda
const availablePropertySorts = ['createdAt', 'propertyPrice', 'propertySquare'];
```

`config.ts`dagi **to'g'ri, to'liq** ro'yxat esa **hech qachon import qilinmagan edi**:
```ts
// config.ts — to'g'ri ro'yxat, lekin ishlatilmagan
export const availablePropertySorts = ['createdAt', 'updatedAt', 'propertyLikes', 'propertyViews', 'propertyRank', 'propertyPrice'];
```

Ikkala o'zgaruvchi **bir xil nomga ega**, lekin butunlay **boshqa qiymatlar**ni saqlaydi — kod ichida qaysi biri ishlatilayotganini ko'rish uchun diqqat bilan qarash kerak edi.

---

### Slayd 24 — Xato #5: yechim va nega bu muhim

**Prompt:**
"Yechim + ta'sir slaydi yarat. Sarlavha: 'Yechim va uning ta\'siri'."

**Yechim:**
```ts
// ❌ o'chirildi: const availablePropertySorts = [...]
// ✅ qo'shildi:
import { availableOptions, availablePropertySorts } from '../../../config';
```

**Nega bu muhim edi:** Bu xato tufayli, `sort` parametriga `"propertyRank"`, `"updatedAt"`, yoki `"propertyLikes"` yuborgan **har qanday** foydalanuvchi (typo qilmasa ham!) xato olar edi. Bu — **potentsial ko'rinmas bug** edi, chunki hamma "propertyRank to'g'ri qiymat-ku" deb o'ylab, xatoni boshqa joydan qidirar edi.

Xuddi shu turdagi xato `availableOptions`da ham topilib, birga tuzatildi.

---

### Slayd 25 — Xato #6: kirish — Academy darsida fail

**Prompt:**
"Shaxsiy/kontekstli kirish slaydi yarat. Sarlavha: 'Xato #6 — Nega dars vazifasi fail bo\'ldi?'."

Academy tekshiruv tizimidan kelgan xabar:
```
[121-122] Property - develop property related GraphQL APIs
Cannot query field "createdAt" on type "Property"
```

Test tizimi `Property` obyektidan `createdAt` maydonini so'ragan, lekin GraphQL "bunday maydon yo'q" deb javob bergan.

---

### Slayd 26 — Xato #6: sabab — "ma'lumot bor, lekin ko'rinmaydi"

**Prompt:**
"Ikki qutili diagram yarat: chap quti 'MongoDB (haqiqiy ma\'lumot)' ✅ createdAt bor, o'ng quti 'GraphQL Schema (API orqali ko\'rinadigan)' ❌ createdAt yo'q, ular orasida uzilgan chiziq. Sarlavha: 'Ma\'lumot bor — lekin API buni bilmaydi'."

`Property.model.ts`da:
```ts
{ timestamps: true, collection: 'properties' }
```

`timestamps: true` — Mongoose'ga **avtomatik ravishda** har bir hujjatga `createdAt` va `updatedAt`ni qo'shishni buyuradi. MongoDB'da bu ma'lumot **100% mavjud**.

Lekin GraphQL chiqish tipida (`property.ts`) faqat `updatedAt` yozilgan edi — `createdAt` uchun `@Field()` **umuman yo'q edi**. GraphQL — faqat siz **aniq e'lon qilgan** maydonlarni "biladi", DB'da nima borligini "taxmin qilmaydi".

---

### Slayd 27 — Xato #6: yechim

**Prompt:**
"Before/after kod slaydi yarat. Sarlavha: 'Yechim — bitta qatorlik, lekin muhim tuzatish'."

```ts
// ✅ Qo'shildi
@Field(() => Date)
createdAt!: Date;

@Field(() => Date)
updatedAt!: Date;
```

**Saboq:** `timestamps: true` ishlatilganda, **ikkala** maydonni (`createdAt` **va** `updatedAt`) GraphQL entity'da qo'lda e'lon qilish — bu doim dasturchining vazifasi, Mongoose buni siz uchun "GraphQL'ga tarjima qilib" bermaydi.

---

## QISM 4: XULOSA

### Slayd 28 — Debugging metodologiyasi — yakuniy sxema

**Prompt:**
"Jarayon-diagram slayd yarat, 4 bosqichli vertikal oqim bilan. Sarlavha: 'Xatoni topish metodologiyasi — qachon qaysi usul kerak'."

1. **Oddiy xato (tip, sintaksis)** → TypeScript kompilyatori (`tsc --noEmit`) yetarli
2. **Runtime xato, ammo tushunarli xabar bilan** → server konsoli logi yetarli
3. **Runtime xato, xabar qisqartirilgan/yashiringan** → `curl` bilan to'g'ridan-to'g'ri so'rov yuborib tekshirish
4. **Xato hali ham tushunarsiz** → muammoni **izolyatsiya qiling** — kichik, mustaqil skript yozib, aynan o'sha funksiyani/validatorni alohida ishga tushiring

---

### Slayd 29 — Umumiy statistika

**Prompt:**
"Katta raqamli infographic slayd yarat, 6 ta metrika kartochka ko'rinishida. Sarlavha: '29-avgust — bir kunlik ish yakunlari'."

| Ko'rsatkich | Son |
|---|---|
| Ko'rib chiqilgan/tuzilgan GraphQL API | 8 |
| Topilgan va tuzatilgan xatolar | 6 |
| Sof TypeScript/tip xatolari | 2 |
| Postman/klient konfiguratsiya xatolari | 2 |
| Chuqur yashiringan mantiqiy bug (shadowing) | 1 |
| GraphQL schema to'liqsizligi | 1 |
| Yozilgan maxsus debug skript | 1 |

---

### Slayd 30 — Asosiy saboqlar (Lessons Learned)

**Prompt:**
"Yakuniy saboqlar slaydi yarat, 6 ta karta ko'rinishida, har biriga mos ikonka bilan."

1. **Bir xil nomli o'zgaruvchini ikki joyda e'lon qilma** — import va mahalliy `const` orasidagi nom to'qnashuvi (shadowing) — eng qiyin topiladigan bug turi
2. **`timestamps: true` — avtomatik, lekin "ko'rinmas"** — GraphQL'ga har doim qo'lda e'lon qilish kerak
3. **Tip (`type`) — va'da** — GraphQL entity'dagi tip, haqiqiy ma'lumot bilan mos kelishi shart
4. **`null`/`undefined`ni yashirmang, tipda ko'rsating** — TypeScript sizga yordam beradi, agar haqiqatni aytsangiz
5. **Postman — o'z holatiga ega vosita** — har bir tab'ning Variables'i mustaqil, ehtiyot bo'lish kerak
6. **Konsol logi yetmasa — izolyatsiya qiling** — kichik mustaqil test ba'zida eng tez yechim

---

### Slayd 31 — Yakun

**Prompt:**
"Yopilish slaydi yarat, minimalistik dizayn. Sarlavha: 'Rahmat!'. Pastda kichik matn: 'Barcha 6 ta xato TypeScript kompilyatsiyasi, real GraphQL so\'rovlari va maxsus debug skript orqali tasdiqlangan holda tuzatildi.' Pastki chap burchakda sana: '29-avgust, 2026'."
