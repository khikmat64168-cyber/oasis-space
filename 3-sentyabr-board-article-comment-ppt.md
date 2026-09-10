# 3-sentyabr — BoardArticle va Comment API'lari: PPT promptlar

> Bu fayl — 2026-09-03 kuni yaratilgan/tuzatilgan **BoardArticle** va **Comment** modullarining har bir API'sini, bizning "kodni chapdan o'ngga, qadam-baqadam o'qish" uslubimizda tushuntiruvchi taqdimot (PPT) uchun slayd-promptlardan iborat.
>
> **Eslatma:** Siz "3 avgust" deb yozgan edingiz, lekin bugungi sana — **3-sentyabr, 2026**, va shu kuni qilingan ish aynan BoardArticle/Comment modullari edi — shuning uchun fayl shu sanaga mos yaratildi.

---

## QISM 1: KIRISH

### Slayd 1 — Sarlavha

**Prompt:**
"Sarlavha slaydi yarat. Katta sarlavha: 'BoardArticle va Comment API\'lari'. Kichik sarlavha: '3-sentyabr, 2026 — Kodni qatma-qat o\'qish orqali tahlil'. Fon: kod-mavzusidagi minimalistik dizayn."

---

### Slayd 2 — Bizning "kod o'qish" uslubimiz — eslatma

**Prompt:**
"Metodologiya slaydi yarat, 3 bosqichli diagram bilan. Sarlavha: 'Har bir API\'ni qanday tahlil qilamiz'."

Har bir metodni quyidagi 3 bosqichda o'qiymiz:
1. **Kirish (parametrlar)** — funksiyaga nima beriladi
2. **Jarayon (qadam-baqadam)** — ichkarida nima sodir bo'ladi, qaysi operator (`$in`, `$gte`, destructuring va h.k.) nima uchun ishlatilgan
3. **Chiqish (natija)** — funksiya nima qaytaradi, va bu qanday ma'lumot shakli

---

### Slayd 3 — Ikki modul, umumiy tuzilma

**Prompt:**
"Taqqoslash slaydi yarat, ikkita ustun bilan. Sarlavha: 'BoardArticle va Comment — umumiy ko\'rinish'."

| | BoardArticle | Comment |
|---|---|---|
| API soni | 7 ta | 4 ta |
| Mustaqilligi | O'zi alohida mavjud (forum posti) | Har doim boshqa narsaga bog'liq |
| Statistika maydoni | `articleViews`, `articleComments`, `articleLikes` | (o'zining statistikasi yo'q — boshqalarnikini oshiradi) |

---

## QISM 2: BOARDARTICLE API'LARI

### Slayd 4 — `createBoardArticle`: kirish va maqsad

**Prompt:**
"API tavsif slaydi yarat. Sarlavha: 'createBoardArticle — yangi forum posti yaratish'."

- **Turi:** Mutation, `AuthGuard` bilan (login qilingan har qanday foydalanuvchi yoza oladi, faqat AGENT emas)
- **Kirish:** `input: BoardArticleInput` (sarlavha, matn, kategoriya, rasm) + `memberId` (token'dan)
- **Maqsad:** Yangi post yaratish va muallifning `memberArticles` hisoblagichini oshirish

---

### Slayd 5 — `createBoardArticle`: qadam-baqadam kod

**Prompt:**
"Kod-ko'rsatish slaydi yarat. Sarlavha: 'createBoardArticle — ichkarida nima bo\'lyapti'."

```ts
public async createBoardArticle(memberId: ObjectId, input: BoardArticleInput): Promise<BoardArticle> {
    input.memberId = memberId;          // 1) tasdiqlangan muallif ID'sini input'ga yozish
    try {
        const result = await this.boardArticleModel.create(input);   // 2) bazaga yozish
        await this.memberService.memberStatsEditor({                 // 3) muallifning hisoblagichini +1
            _id: memberId, targetKey: 'memberArticles', modifier: 1,
        });
        return result;                  // 4) yaratilgan postni qaytarish
    } catch (err) {
        throw new BadRequestException(Message.CREATE_FAILED);        // 5) xato bo'lsa — aniq xabar bilan to'xtatish
    }
}
```

**Diqqat:** `input.memberId = memberId` — bu `createProperty`da ko'rgan xavfsizlik naqshining o'zi: muallif ID'si client'dan emas, **token'dan** olinadi.

---

### Slayd 6 — `getBoardArticle`: kirish va maqsad

**Prompt:**
"API tavsif slaydi yarat. Sarlavha: 'getBoardArticle — bitta postni ko\'rish va view hisoblash'."

- **Turi:** Query, `WithoutGuard` (login shart emas)
- **Kirish:** `articleId` (string, keyin `ObjectId`ga aylantiriladi) + ixtiyoriy `memberId`
- **Maqsad:** Postni topish, ko'rishlar sonini oshirish (agar yangi ko'rish bo'lsa), muallif ma'lumotini biriktirish

---

### Slayd 7 — `getBoardArticle`: qadam-baqadam kod

**Prompt:**
"Kod-ko'rsatish slaydi yarat, raqamlangan izohlar bilan. Sarlavha: 'getBoardArticle — 4 bosqichli jarayon'."

```ts
public async getBoardArticle(memberId: ObjectId, articleId: ObjectId): Promise<BoardArticle> {
    const search: T = { _id: articleId, articleStatus: BoardArticleStatus.ACTIVE };  // 1) faqat faol postlarni qidir

    const targetBoardArticle = await this.boardArticleModel.findOne(search).lean().exec();  // 2) top
    if (!targetBoardArticle) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

    if (memberId) {                                    // 3) login qilingan bo'lsa — view yozish
        const newView = await this.viewService.recordView({...});
        if (newView) {                                  // faqat YANGI ko'rish bo'lsa
            await this.boardArticleStatsEditor({ _id: articleId, targetKey: 'articleViews', modifier: 1 });
            targetBoardArticle.articleViews++;
        }
    }

    targetBoardArticle.memberData = await this.memberService.getMember(null, targetBoardArticle.memberId);  // 4) muallif ma'lumotini qo'shish
    return targetBoardArticle;
}
```

**Bu — `getProperty`bilan aynan bir xil naqsh** (`.lean()`, `recordView`, statsEditor, `memberData` biriktirish) — faqat "property" o'rniga "board article" uchun.

---

### Slayd 8 — `boardArticleStatsEditor`: universal hisoblagich

**Prompt:**
"Kod-ko'rsatish slaydi yarat. Sarlavha: 'boardArticleStatsEditor — universal +1/-1 mexanizmi'."

```ts
public async boardArticleStatsEditor(input: StatisticModifier): Promise<BoardArticle | null> {
    const { _id, targetKey, modifier } = input;    // 1) qaysi hujjat, qaysi maydon, qancha o'zgartirish
    return await this.boardArticleModel
        .findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })   // 2) MongoDB'ning $inc bilan oshirish/kamaytirish
        .exec();
}
```

**`$inc`** — MongoDB operatori, "berilgan maydonni berilgan songa oshir/kamaytir" degani. `[targetKey]` — computed property name (dinamik maydon nomi, avval `sort`da ko'rgan texnika) — shu bitta funksiya `articleViews`, `articleComments`, `articleLikes` — **istalgan** sonli maydonni oshirish/kamaytirish uchun ishlatilishi mumkin.

---

### Slayd 9 — `updateBoardArticle`: o'z postini tahrirlash

**Prompt:**
"API tavsif + kod slaydi yarat. Sarlavha: 'updateBoardArticle — muallifning o\'z postini yangilashi'."

```ts
public async updateBoardArticle(memberId: ObjectId, input: BoardArticleUpdate): Promise<BoardArticle> {
    const { _id, articleStatus } = input;
    const result = await this.boardArticleModel.findOneAndUpdate(
        { _id: _id, memberId: memberId, articleStatus: BoardArticleStatus.ACTIVE },  // faqat O'ZINING faol posti
        input, { new: true },
    ).exec();

    if (articleStatus === BoardArticleStatus.DELETE) {   // agar "o'chirilgan" statusga o'tsa
        await this.memberService.memberStatsEditor({ _id: memberId, targetKey: 'memberArticles', modifier: -1 });
    }
    return result;
}
```

**Xavfsizlik nuqtasi:** filtrda `memberId: memberId` bor — ya'ni **faqat o'zi yozgan** postini yangilay oladi, boshqa birovning postini emas.

---

### Slayd 10 — `getBoardArticles`: ro'yxat va filtrlash

**Prompt:**
"Kod-ko'rsatish slaydi yarat. Sarlavha: 'getBoardArticles — filtrlangan, sahifalangan ro\'yxat'."

```ts
public async getBoardArticles(memberId: ObjectId, input: BoardArticlesInquiry): Promise<BoardArticles> {
    const { articleCategory, text } = input.search;
    const match: T = { articleStatus: BoardArticleStatus.ACTIVE };

    if (articleCategory) match.articleCategory = articleCategory;
    if (text) match.articleTitle = { $regex: new RegExp(text, 'i') };
    if (input.search?.memberId) match.memberId = shapeIntoMongoObjectId(input.search.memberId);

    // ... $facet: { list: [skip, limit, lookupMember, unwind], metaCounter: [count] }
}
```

Bu — `getProperties`bilan **bir xil arxitektura**: `$match` + `$facet` (`list` + `metaCounter`), faqat filtrlar boardArticle'ga xos (`articleCategory`, `articleTitle` bo'yicha matn qidiruv).

---

### Slayd 11 — Admin API'lari (3 tasi, jamlab)

**Prompt:**
"Jadval slaydi yarat. Sarlavha: 'BoardArticle — Admin uchun 3 ta API'."

| API | Vazifasi | Muhim farqi |
|---|---|---|
| `getAllBoardArticlesByAdmin` | Barcha postlarni (statusidan qat'iy nazar) ko'rish | `articleStatus` filtri ixtiyoriy — hammasini ko'rsatishi mumkin |
| `updateBoardArticleByAdmin` | Istalgan postni admin nomidan tahrirlash | Filtrida `memberId` **yo'q** — o'z-o'zidan istalgan muallifning postiga tegishi mumkin |
| `removeBoardArticleByAdmin` | Postni butunlay o'chirish | `findOneAndDelete` — bazadan **butunlay olib tashlaydi**, `updateBoardArticle`dagi kabi statusni "DELETE" qilib belgilash emas |

---

## QISM 3: COMMENT API'LARI

### Slayd 12 — Comment tizimining maxsus jihati

**Prompt:**
"Konseptual slayd yarat, markazda 'Comment', uchta strelka bilan Property/Article/Member'ga. Sarlavha: 'Comment — universal, 3 xil obyektga bog\'lanadigan modul'."

Comment — property, article yoki member'ga bog'lanishi mumkin. Buni **`commentGroup`** (qaysi turdagi obyekt) va **`commentRefId`** (aynan qaysi obyekt) maydonlari orqali biladi.

---

### Slayd 13 — `createComment`: kirish va maqsad

**Prompt:**
"API tavsif slaydi yarat. Sarlavha: 'createComment — izoh yaratish va statistikani yangilash'."

- **Turi:** Mutation, `AuthGuard` bilan
- **Kirish:** `commentGroup` (PROPERTY/ARTICLE/MEMBER), `commentContent`, `commentRefId`
- **Maqsad:** Izohni yaratish, VA **qaysi turdagi obyektga** qoldirilganiga qarab, o'sha obyektning mos statistikasini oshirish

---

### Slayd 14 — `createComment`: qadam-baqadam kod

**Prompt:**
"Kod-ko'rsatish slaydi yarat, switch/case diagram bilan. Sarlavha: 'createComment — switch orqali 3 yo\'lga ajralish'."

```ts
public async createComment(memberId: ObjectId, input: CommentInput): Promise<Comment> {
    input.memberId = memberId;

    let result: Comment | null = null;      // 1) tip aniq belgilangan (bugungi tuzatishimiz!)
    try {
        result = await this.commentModel.create(input);   // 2) izohni yaratish
    } catch (err) {
        throw new BadRequestException(Message.CREATE_FAILED);
    }

    switch (input.commentGroup) {           // 3) QAYSI obyektga qoldirilgan?
        case CommentGroup.PROPERTY:
            await this.propertyService.propertyStatsEditor({ _id: input.commentRefId, targetKey: 'propertyComments', modifier: 1 });
            break;
        case CommentGroup.ARTICLE:
            await this.boardArticleService.boardArticleStatsEditor({ _id: input.commentRefId, targetKey: 'articleComments', modifier: 1 });
            break;
        case CommentGroup.MEMBER:
            await this.memberService.memberStatsEditor({ _id: input.commentRefId, targetKey: 'memberComments', modifier: 1 });
            break;
    }

    if (!result) throw new InternalServerErrorException(Message.CREATE_FAILED);
    return result;
}
```

**Muhim tushuncha:** Bitta `createComment` — **3 xil boshqa service**ni (`propertyService`, `boardArticleService`, `memberService`) chaqira oladi, `commentGroup`ga qarab. Bu — modullar orasidagi **hamkorlik (composition)**ning yaqqol namunasi.

---

### Slayd 15 — `updateComment` va `getComments`

**Prompt:**
"Ikkita API'ni bitta slaydda ko'rsat. Sarlavha: 'updateComment va getComments — qisqacha'."

**`updateComment`** — faqat o'z izohini (`memberId` filtr orqali) tahrirlash mumkin, `CommentStatus.ACTIVE` bo'lganlarinigina.

**`getComments`** — `commentRefId` bo'yicha filtrlab (masalan "shu property'ga qoldirilgan barcha izohlar"), `$facet` orqali sahifalab, `lookupMember`+`$unwind` bilan har bir izoh muallifining ma'lumotini biriktirib qaytaradi — xuddi `getProperties`/`getBoardArticles`dagi kabi.

---

### Slayd 16 — `removeCommentByAdmin`

**Prompt:**
"Kod-ko'rsatish slaydi yarat. Sarlavha: 'removeCommentByAdmin — admin uchun to\'liq o\'chirish'."

```ts
public async removeCommentByAdmin(input: ObjectId): Promise<Comment> {
    const result = await this.commentModel.findByIdAndDelete(input);
    if (!result) throw new InternalServerErrorException(Message.REMOVE_FAILED);
    return result;
}
```

Eng sodda API — faqat ADMIN (`RolesGuard`) uchun, filtrsiz, to'g'ridan-to'g'ri `_id` bo'yicha butunlay o'chiradi.

---

## QISM 4: BUGUN TOPILGAN VA TUZATILGAN XATOLAR

### Slayd 17 — Xatolar xaritasi

**Prompt:**
"Roadmap slayd yarat, 8 bosqich bilan. Sarlavha: 'Bugungi 8 ta xato'."

1. Import yo'llarida bitta `../` yetishmasligi (board-article + comment)
2. `ObjectId` uchun `import type` kerakligi
3. Bo'sh `common.enum.ts`dan `Direction` import qilinishi
4. `BoradArticle` — model nomi yozuv xatosi
5. `boardArticleStatsEditor` — bo'sh "stub" metod
6. `getAllBoardArticlesByAdmin` — umuman yozilmagan metod
7. `Comment` — global DOM tipi bilan chalkashib ketishi
8. `CommentService` — ikki marta ro'yxatdan o'tkazilishi (DI konflikti)

---

### Slayd 18 — Xato #1-2: Import yo'llari va `import type`

**Prompt:**
"Before/after kod slaydi yarat. Sarlavha: 'Import yo\'li va import type xatolari'."

```ts
// ❌ Oldin
import { BoardArticleCategory } from '../../enums/board-article.enum';   // bitta ../ kam
import { ObjectId } from 'mongoose';                                      // import type kerak edi

// ✅ Keyin
import { BoardArticleCategory } from '../../../enums/board-article.enum';
import type { ObjectId } from 'mongoose';
```

Bu ikkala xato **board-article** va **comment** modullarining barcha DTO fayllarida (`*.ts`, `*.input.ts`, `*.update.ts`) takrorlangan edi.

---

### Slayd 19 — Xato #3: Bo'sh fayldan import

**Prompt:**
"Tushuntirish slaydi yarat. Sarlavha: 'common.enum.ts — bo\'sh \"qopqon\" fayl'."

```ts
import { Direction } from '../../../enums/common.enum';   // ❌ bu fayl BO'SH!
import { Direction } from '../../../Errors';               // ✅ haqiqiy joyi
```

Bu xato — sessiya davomida **4 marta** (member, property, board-article, comment DTO'larida) takrorlangan eng ko'p uchragan xato turi edi.

---

### Slayd 20 — Xato #4: Model nomi yozuv xatosi

**Prompt:**
"Xato-ko'rsatish slaydi yarat. Sarlavha: '\"Borad\"Article — harflar joyi almashgan'."

```ts
// board-article.module.ts
MongooseModule.forFeature([{ name: 'BoradArticle', schema: BoardArticleSchema }])   // ❌
// lekin service:
@InjectModel('BoardArticle')   // ✅ to'g'ri nom bilan so'ralgan
```

Ikki nom **mos kelmagani** uchun `Nest can't resolve dependencies` xatosi chiqqan edi.

---

### Slayd 21 — Xato #5-6: Yozilmagan metodlar

**Prompt:**
"Ikkita darajani ko'rsatuvchi slayd yarat. Sarlavha: 'Ikki xil \"yo\'qlik\" darajasi'."

- **`boardArticleStatsEditor`** — metod **mavjud edi**, lekin ichi bo'sh: `throw new Error('Method not implemented.')`
- **`getAllBoardArticlesByAdmin`** — metod **umuman yo'q edi**, resolver uni chaqirganda `"is not a function"` xatosi chiqdi

Ikkalasi ham `property.service.ts`dagi tasdiqlangan naqsh (`$facet`, `findByIdAndUpdate` + `$inc`) asosida to'liq yozib qo'yildi.

---

### Slayd 22 — Xato #7: "Yashirin" DOM tipi bilan chalkashish

**Prompt:**
"Diagram slayd yarat — ikkita quti: 'Bizning Comment (ma\'lumotlar bazasi)' va 'Brauzer Comment (HTML node)', ikkalasi ham bir xil nom bilan. Sarlavha: 'Bir xil nom, butunlay boshqa ma\'no'."

`Comment` import qilinmagani uchun, TypeScript uni **avtomatik ravishda** brauzer/JS muhitidagi global `Comment` (HTML izoh-node) tipiga bog'lab qo'ygan edi. Bu — kompilyatsiya darajasida sezilmaydigan, lekin **mantiqiy jihatdan butunlay noto'g'ri** bog'lanish edi. `Comment`ni to'g'ri joydan import qilgach, xato ochilib chiqdi va tuzatildi.

---

### Slayd 23: Xato #8 — Bitta servisning ikki marta "tug'ilishi"

**Prompt:**
"Diagram slayd yarat: bitta 'CommentService' quti, ikkita turli ota-modulga (ComponentsModule va CommentsModule) ulanган, ikkalasi ham uni yaratishga urinayotgan holatda. Sarlavha: '?, MemberService, PropertyService...\' — kim CommentModel\'ni bermadi?'."

`CommentResolver`/`CommentService` ham to'g'ridan-to'g'ri `ComponentsModule`da, ham `CommentsModule` orqali **ikki marta** provider sifatida e'lon qilingan edi. Birinchisida `MongooseModule.forFeature('Comment')` yo'q edi — shuning uchun o'sha nusxa `CommentModel`ni topa olmadi. Dublikatni olib tashlash bilan tuzatildi.

---

## QISM 5: YAKUN

### Slayd 24 — Umumiy statistika

**Prompt:**
"Infographic slayd yarat. Sarlavha: '3-sentyabr — raqamlarda'."

| Ko'rsatkich | Son |
|---|---|
| Ko'rib chiqilgan API'lar (BoardArticle + Comment) | 11 |
| Topilgan va tuzatilgan xatolar | 8 |
| "Bo'sh fayldan import" xatosi (`common.enum.ts`) — sessiyadagi umumiy soni | 4 |
| To'liq yozib qo'yilgan yetishmayotgan metodlar | 2 |

---

### Slayd 25 — Asosiy saboqlar

**Prompt:**
"Yakuniy saboqlar slaydi yarat, 5 ta karta bilan."

1. **Har bir yangi modul, oldingi modul naqshiga qat'iy mos bo'lishi kerak** — import chuqurligi, fayl nomlash, tip belgilash bir xil bo'lmasa, xatolar ko'payadi
2. **Global tip nomlari bilan to'qnashishdan ehtiyot bo'ling** (`Comment`, `Document` kabi) — har doim aniq import qiling
3. **Bitta servisni ikki marta ro'yxatdan o'tkazmang** — NestJS modul grafida har bir servis **bitta joyda** yaratilishi kerak
4. **"Stub" metodlarni unutib qo'ymang** — `throw new Error('Method not implemented')` — bu kelajakdagi o'zingizga yozgan eslatma
5. **Bir xil arxitekturani takrorlang** — `$match`+`$facet`, `statsEditor` naqshi — bir marta to'g'ri yozilgach, boshqa modullarga ham xuddi shunday ko'chiriladi

---

### Slayd 26 — Yakun

**Prompt:**
"Yopilish slaydi yarat. Sarlavha: 'Rahmat!'. Pastda: 'Barcha 11 ta API va 8 ta xato TypeScript kompilyatsiyasi va real server ishga tushirish orqali tasdiqlandi.' Sana: '3-sentyabr, 2026'."
