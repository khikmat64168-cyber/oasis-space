# 8-sentyabr — Favorites & Visited Properties: PPT promptlar

> Bu fayl — 2026-09-08 kuni `nestar-api` loyihasida qilingan ish (`lookupAuthMemberLiked` bug-fix, **Favorites** va **Visited Properties** funksiyalari) bo'yicha taqdimot uchun slayd-promptlardan iborat. Har bir muhim kod bo'lagi **qator-baqator tushuntirilgan** — PPT'ga to'g'ridan-to'g'ri kod bloki sifatida kesib joylashtirish mumkin.

---

## QISM 1: KIRISH

### Slayd 1 — Sarlavha

**Prompt:**
"Sarlavha slaydi yarat. Katta sarlavha: 'Nestar API — Favorites & Visited Properties'. Kichik sarlavha: '8-sentyabr, 2026 — MongoDB $lookup, $expr va aggregatsiya chuqur tahlili'."

---

### Slayd 2 — Bugungi ish xulosasi

**Prompt:**
"Kontent slaydi yarat, 3 ta blok bilan. Sarlavha: 'Bugun nima qildik'."

1. **`lookupAuthMemberLiked` xatosini tuzatish** — 5 ta bug (1 tasi serverni yiqitgan, 4 tasi "jim" ishlamaydigan)
2. **Favorites (like bosilgan property'lar) funksiyasi** — to'liq zanjir: `config.ts` → `like.service.ts` → `property.service.ts` → `property.resolver.ts`
3. **Visited Properties (ko'rilgan property'lar) funksiyasi** — Favorites bilan **bir xil arxitektura naqshi**, faqat `Like` o'rniga `View` collection'i ishlatilgan

---

## QISM 2: `lookupAuthMemberLiked` XATOSI

### Slayd 3 — Xato nima edi

**Prompt:**
"Xato-ko'rsatish slaydi yarat, qizil xato matni bilan. Sarlavha: 'Server yiqilishiga sabab bo'lgan xato'."

```
Invalid $project :: caused by :: Use of undefined variable: localMyFavorite
```

Bu xato — `getProperties` so'rovini chaqirganda, `meLiked` maydoni **so'ralmagan bo'lsa ham** chiqadi, chunki MongoDB pipeline'ning **barcha** bosqichlarini bajaradi, GraphQL faqat oxirida natijani filtrlaydi.

---

### Slayd 4 — Kod: oldin (xato bilan)

**Prompt:**
"Kod-ko'rsatish slaydi yarat, qizil ramka bilan xato joylarni belgila. Sarlavha: 'Xatoli kod'."

```ts
export const lookupAuthMemberLiked = (memberId: T, targetRefId: string = '$_id') => {
  //  ↑ 1. funksiya 2 ta parametr oladi: kim so'rayapti (memberId),
  //     va nimaga ishora (targetRefId — standart holatda joriy hujjatning o'zi, '$_id')
  return {
    $lookup: {                          // 2. "likes" collection'i bilan bog'lanish boshlanadi
      from: 'likes',                    // 3. qaysi collection'dan qidiramiz
      let: {                            // 4. pipeline ichida ishlatiladigan "mahalliy o'zgaruvchilar"ni e'lon qilish
        localLikeRefId: targetRefId,    //    tashqaridan kelgan targetRefId'ni shu nom bilan saqlab qo'yish
        localMemberId: memberId,        //    tashqaridan kelgan memberId'ni shu nom bilan saqlab qo'yish
        localMyFavourite: true,         // ❌ 5. XATO: "Favourite" — "u" bilan yozilgan (keyinroq mos kelmaydi)
      },
      pipeline: [                       // 6. "likes" ichida qanday qidiruv/qayta ishlov ketma-ketligi bajarilishi
        {
          $match: {                     // 7. faqat shartga mos hujjatlarni qoldirish
            $expr: {                    // 8. ODDIY $match emas — ikkita MAYDONNI solishtirish kerak, shuning uchun $expr
              $and: [                   // 9. ikkala shart HAM to'g'ri bo'lishi kerak
                { $eq: ['targetRefId', '$localLikeRefId'] },
                // ❌ 10. XATO: 'targetRefId' — belgisiz, shunchaki MATN (hujjat maydoniga ishora emas)
                //         '$localLikeRefId' — bitta $, lekin bu let-o'zgaruvchi, ikkita $$ kerak edi
                { $eq: ['memberId', '$localMemberId'] },
                // ❌ 11. XATO: xuddi shu ikki xato bu qatorda ham takrorlangan
              ],
            },
          },
        },
        {
          $project: {                   // 12. natijada qaysi maydonlar ko'rinishini belgilash
            _id: 0,                     //     _id'ni chiqarib tashlash
            memberId: 1,                //     memberId'ni qoldirish
            likeRefId: 1,                //     likeRefId'ni qoldirish
            myFavorite: '$$localMyFavorite',
            // ❌ 13. XATO: bu yerda "Favorite" ("u"siz) deb yozilgan, lekin let'da "Favourite" ("u" bilan) edi
            //          MongoDB bunday nomli o'zgaruvchini topa olmaydi → SERVER YIQILADI
          },
        },
      ],
      as: 'meLiked',                    // 14. yakuniy natija shu nom bilan asosiy hujjatga qo'shiladi
    },
  };
};
```

---

### Slayd 5 — 1-xato: imlo farqi (server yiqilishining sababi)

**Prompt:**
"Solishtirish slaydi yarat, ikkita so'zni yonma-yon katta shriftda ko'rsat: 'localMyFavourite' vs 'localMyFavorite', orasida qizil X belgisi. Sarlavha: 'Bitta harf — butun serverni yiqitadi'."

- `let` blokida e'lon qilingan: **`localMyFavourite`** (britancha, "u" bilan)
- `$project`da ishlatilgan: **`$$localMyFavorite`** (amerikacha, "u"siz)

**Qoida:** `let` bilan e'lon qilingan o'zgaruvchi nomi va `$$` orqali murojaat qilingan nom **harfma-harf bir xil** bo'lishi shart. Mos kelmasa — MongoDB "bunday o'zgaruvchi yo'q" deb xato beradi.

---

### Slayd 6 — 2-5-xatolar: `$` va `$$` farqi

**Prompt:**
"Tushuntirish slaydi yarat, jadval bilan ($ va $$ ustunlari). Sarlavha: 'MongoDB'da $ va $$ — ikki xil narsa'."

| Belgi | Ma'nosi | Misol |
|---|---|---|
| **`$fieldName`** (bitta `$`) | Joriy **hujjat maydoni**ga ishora | `'$likeRefId'` — hujjatning `likeRefId` maydoni |
| **`$$varName`** (ikkita `$$`) | `let`dan kelgan **o'zgaruvchi**ga ishora | `'$$localLikeRefId'` — tashqaridan uzatilgan qiymat |
| **`'varName'`** (belgisiz) | Oddiy **matn (string)** — hech narsaga ishora qilmaydi! | `'targetRefId'` — bu shunchaki so'z, xato |

Xato kodda **`'targetRefId'`** va **`'memberId'`** — hech qanday belgisiz yozilgan, ya'ni ular **oddiy matn** deb qabul qilingan, hujjat maydoniga ishora emas. Va **`'$localLikeRefId'`** — bitta `$` bilan, lekin bu `let`dan kelgan o'zgaruvchi bo'lgani uchun **ikkita `$$`** kerak edi.

---

### Slayd 7 — Kod: keyin (tuzatilgan)

**Prompt:**
"Kod-ko'rsatish slaydi yarat, yashil ramka bilan to'g'ri joylarni belgila. Sarlavha: 'Tuzatilgan kod'."

```ts
let: {
  localLikeRefId: targetRefId,
  localMemberId: memberId,
  localMyFavorite: true,               // ✅ 1. endi $project'dagi nom bilan HARFMA-HARF bir xil
},
pipeline: [
  {
    $match: {
      $expr: {
        $and: [
          { $eq: ['$likeRefId', '$$localLikeRefId'] },
          //       ↑ 2. BITTA $ — "likes" hujjatining likeRefId maydoni
          //                    ↑ 3. IKKITA $$ — let'dan kelgan localLikeRefId o'zgaruvchisi
          { $eq: ['$memberId', '$$localMemberId'] },
          //       ↑ 4. bitta $ — hujjat maydoni        ↑ 5. ikkita $$ — let o'zgaruvchisi
        ],
      },
    },
  },
  // $project o'zgarishsiz qoldi — endi $$localMyFavorite let blokidagi nom bilan mos keladi
]
```

**Qatorma-qator o'qish:** `$eq: ['$likeRefId', '$$localLikeRefId']` — "joriy `likes` hujjatining `likeRefId` maydoni (`$` — bitta belgi), `let` orqali tashqaridan uzatilgan `localLikeRefId` qiymatiga (`$$` — ikkita belgi) teng bo'lsa" degan shartni bildiradi. Ikkalasi ham `$and` ichida bo'lgani uchun, **ikkalasi HAM to'g'ri bo'lgandagina** hujjat qabul qilinadi.

**Natija:** Real test bilan tasdiqlandi — like bosilmagan holatda `meLiked: []`, like bosilgandan keyin `meLiked: [{memberId, likeRefId, myFavorite: true}]`.

---

## QISM 3: FAVORITES (LIKE BOSILGAN PROPERTY'LAR)

### Slayd 8 — Favorites nima va nega kerak

**Prompt:**
"Konseptual slayd yarat, foydalanuvchi-oqimi diagram bilan (User → Like bosadi → keyinroq → 'Sevimlilarim' bo'limiga kiradi → property qaytadi). Sarlavha: 'Favorites — \"sevimlilarim\" bo\'limi'."

- Foydalanuvchi bir nechta property'ga **like** bosadi (`likeTargetProperty`)
- Keyinroq, u **"men like bosgan barcha property'larni"** bir joyda ko'rmoqchi bo'ladi
- Bu — Instagram'dagi "Saqlangan postlar" yoki Airbnb'dagi "Sevimlilar" bo'limiga o'xshaydi

**Muammo:** `likes` collection'ida faqat `{memberId, likeRefId, likeGroup}` saqlanadi — **property'ning o'zi emas**, faqat unga ishora (`likeRefId`). Property'ning to'liq ma'lumotini (sarlavha, narx, rasm) olish uchun **`properties` collection'i bilan bog'lash (`$lookup`)** kerak.

---

### Slayd 9 — `getFavoritesProperties` — to'liq kod

**Prompt:**
"To'liq kod bloki slaydi yarat, syntax-highlight bilan. Sarlavha: 'like.service.ts — getFavoritesProperties'."

```ts
public async getFavoritesProperties(memberId: ObjectId, input: OrdinaryInquiry): Promise<Properties> {

  const { page, limit } = input;
  // ↑ 1. Client yuborgan {page, limit} obyektidan ikkita qiymatni destructuring orqali ochib olish

  const match: T = { likeGroup: LikeGroup.PROPERTY, memberId: memberId };
  // ↑ 2. Filtr tayyorlash: "likes" collection'idan FAQAT property'larga tegishli (likeGroup),
  //      VA aynan shu foydalanuvchi (memberId) bosgan like'larni tanlash

  const data: T = await this.likeModel
    .aggregate([
      { $match: match },
      // ↑ 3. 2-qatordagi filtrni haqiqatda qo'llash — mos kelmagan hujjatlar bu yerda chetlanadi

      { $sort: { updatedAt: -1 } },
      // ↑ 4. Qolgan hujjatlarni saralash: -1 = kamayish tartibida, ya'ni ENG OXIRGI like'langan birinchi keladi

      {
        $lookup: {                        // 5. "likes"dan "properties"ga BOG'LANISH boshlanadi
          from: 'properties',              //    qaysi collection'dan qidiriladi
          localField: 'likeRefId',         //    "likes" hujjatining qaysi maydoni bo'yicha
          foreignField: '_id',             //    "properties" collection'idagi qaysi maydonga solishtirib
          as: 'favoriteProperty',          //    topilgan natija shu NOM bilan qo'shiladi (massiv sifatida)
        },
      },
      { $unwind: '$favoriteProperty' },
      // ↑ 6. $lookup natijasi HAR DOIM massiv bo'ladi ([property]) — $unwind uni OCHIB,
      //      oddiy (massiv bo'lmagan) obyektga aylantiradi: favoriteProperty: {...}

      {
        $facet: {                          // 7. bitta so'rovdan IKKI XIL natija olish uchun "ayirish"
          list: [                          //    ── birinchi filial: sahifalangan ro'yxat
            { $skip: (page - 1) * limit },  //       oldingi sahifalardagi elementlarni o'tkazib yuborish
            { $limit: limit },              //       faqat shu sahifaga tegishlisini qoldirish
            lookupFavorite,                 //       property egasining (agent) profilini qo'shib olish
            { $unwind: '$favoriteProperty.memberData' },
            //                               //       egasining ma'lumoti ham massiv sifatida keladi — ochish
          ],
          metaCounter: [{ $count: 'total' }],
          // ↑                              //    ── ikkinchi filial: skip/limit'ga qaramasdan JAMI son
        },
      },
    ])
    .exec();
  // ↑ Shu yergacha — MongoDB'ning o'zida bajariladigan aggregatsiya tugadi

  const result: Properties = { list: [], metaCounter: data[0].metaCounter };
  // ↑ 8. GraphQL kutgan "Properties" shakliga mos, hozircha bo'sh "list"li obyekt tayyorlash

  result.list = data[0].list.map((ele) => ele.favoriteProperty);
  // ↑ 9. MUHIM QATOR: data[0].list — hali "likes" hujjatlari, ichida favoriteProperty bilan.
  //      .map() orqali HAR BIR elementdan FAQAT favoriteProperty qismini olib,
  //      yangi massiv yasaymiz — endi bu to'g'ridan-to'g'ri Property[] bo'lib qoladi

  return result;
  // ↑ 10. Tayyor {list: Property[], metaCounter} obyektini qaytarish
}
```

---

### Slayd 10 — 1-2-qatorlar: parametrlar va filtr

**Prompt:**
"Kod-tushuntirish slaydi yarat, birinchi 3 qatorni katta shriftda ko'rsat, yon tarafida izoh. Sarlavha: 'Boshlanish — kim so\'rayapti, nimani qidiryapmiz'."

```ts
const { page, limit } = input;
const match: T = { likeGroup: LikeGroup.PROPERTY, memberId: memberId };
```

- **`page`, `limit`** — sahifalash uchun (nechinchi sahifa, har sahifada nechta)
- **`match`** — `likes` collection'idan **faqat property'larga tegishli** (`likeGroup: PROPERTY` — member yoki article emas) va **aynan shu foydalanuvchi** (`memberId`) bosgan like'larni filtrlaydi

---

### Slayd 11 — `$lookup` + `$unwind`: like yozuvini to'liq property'ga aylantirish

**Prompt:**
"Diagram slaydi yarat — chapda 'likes' hujjati (kichik, faqat ID'lar), o'ngda 'properties' hujjati (katta, to'liq ma'lumot), o'rtada strelka va '$lookup' yozuvi. Sarlavha: '$lookup — kichik yozuvni to\'liq ma\'lumotga bog\'lash'."

```ts
{
  $lookup: {
    from: 'properties',           // qaysi collection'dan qidirish
    localField: 'likeRefId',      // 'likes' hujjatining qaysi maydoni bo'yicha
    foreignField: '_id',          // 'properties'dagi qaysi maydonga solishtirib
    as: 'favoriteProperty',       // natijani qanday nom bilan qo'shish
  },
},
{ $unwind: '$favoriteProperty' },   // massivni ochib, oddiy obyektga aylantirish
```

**Natija:** Har bir `likes` hujjati endi ichida **to'liq `favoriteProperty` obyekti**ga ega bo'ladi (sarlavha, narx, rasm — hammasi).

---

### Slayd 12 — `$facet` ichidagi `lookupFavorite`: egasi ma'lumotini qo'shish

**Prompt:**
"Kod + diagram slaydi yarat. Sarlavha: 'Property egasining (agent) profilini ham qo\'shib berish'."

```ts
// config.ts
export const lookupFavorite = {
  $lookup: {
    from: 'members',
    localField: 'favoriteProperty.memberId',      // ichki maydonga ishora (nuqta bilan)
    foreignField: '_id',
    as: 'favoriteProperty.memberData',              // natija ham ICHKARIGA yoziladi
  },
};
```

**Diqqat qilinadigan nuqta:** `localField`/`as` — **`favoriteProperty.memberId`** kabi **nuqta bilan** yozilgan. Bu — MongoDB'ga **"hujjatning ichidagi ichki maydonga qarab bog'lash"** imkonini beradi (2018-yildan beri qo'llab-quvvatlanadi). Natijada `favoriteProperty` obyektining ichiga, yana bir ichki maydon (`memberData`) qo'shiladi.

---

### Slayd 13 — Oxirgi qadam: JavaScript'da tekislash

**Prompt:**
"Before/after ma'lumot tuzilishi slaydi yarat (JSON daraxt ko'rinishida). Sarlavha: 'Nega .map() kerak — natijani \"tekislash\"'."

**`$facet`dan keyingi xom natija** (`data[0].list`):
```json
[
  { "_id": "...", "memberId": "...", "likeRefId": "...",
    "favoriteProperty": { "_id": "...", "propertyTitle": "...", "memberData": [...] } }
]
```

Bu — hali **`likes` hujjati**, ichida `favoriteProperty` bilan. Lekin GraphQL'ga **to'g'ridan-to'g'ri `Property` obyektlari** kerak. Shuning uchun:
```ts
result.list = data[0].list.map((ele) => ele.favoriteProperty);
```
Bu qator — har bir elementdan **faqat `favoriteProperty` qismini olib**, yangi massiv yasaydi. Natijada `list` — to'g'ridan-to'g'ri `Property[]` bo'lib qoladi.

---

### Slayd 14 — To'liq zanjir: resolver → service → service

**Prompt:**
"Zanjir-diagram slaydi yarat, 4 ta quti va strelkalar bilan. Sarlavha: 'Bitta so\'rov, 3 ta fayl orqali o\'tadi'."

```
Client (Postman)
   ↓  getFavorites(input: {page, limit})
PropertyResolver.getFavorites()
   ↓
PropertyService.getFavorites(memberId, input)
   ↓  (LikeService PropertyModule'ga LikeModule orqali ulangan)
LikeService.getFavoritesProperties(memberId, input)
   ↓  (aggregatsiya, $lookup, $facet)
MongoDB → Properties { list, metaCounter }
```

**Muhim nuqta:** `PropertyService`ning o'zi like'lar bilan **to'g'ridan-to'g'ri ishlamaydi** — u faqat `LikeService`ga "vakolat beradi" (delegate qiladi). Bu — mas'uliyatlarni aniq ajratish (separation of concerns) printsipi.

---

## QISM 4: VISITED PROPERTIES (KO'RILGAN PROPERTY'LAR)

### Slayd 15 — Visited Properties — Favorites bilan "egizak" funksiya

**Prompt:**
"Ikki ustunli solishtirish slaydi yarat (Favorites vs Visited), o'xshashliklarni yashil, farqlarni sariq rangda belgila. Sarlavha: 'Bir xil naqsh, ikkinchi marta qo\'llanildi'."

| | Favorites | Visited |
|---|---|---|
| Manba collection | `likes` | `views` |
| Filtr guruhi | `LikeGroup.PROPERTY` | `ViewGroup.PROPERTY` |
| Bog'lovchi maydon | `likeRefId` | `viewRefId` |
| Natija nomi | `favoriteProperty` | `visitedProperty` |
| Servis metodi | `getFavoritesProperties` | `getVisitedProperties` |
| Qaysi servisda | `LikeService` | `ViewService` |

**Xulosa:** Bu ikkinchi funksiyani yozish uchun, birinchisining **naqshini nusxalab, faqat nomlarni almashtirish** kifoya qildi — bu "reusable pattern" (qayta ishlatiladigan naqsh) qurishning aynan afzalligi.

---

### Slayd 16 — `getVisitedProperties` — to'liq kod

**Prompt:**
"To'liq kod bloki slaydi yarat. Sarlavha: 'view.service.ts — getVisitedProperties'."

```ts
public async getVisitedProperties(memberId: ObjectId, input: OrdinaryInquiry): Promise<Properties> {

  const { page, limit } = input;
  // ↑ 1. Sahifalash parametrlarini ochib olish (Favorites'dagi bilan aynan bir xil)

  const match: T = { viewGroup: ViewGroup.PROPERTY, memberId: memberId };
  // ↑ 2. Farqi shu yerda: "likes" o'rniga "views" collection'i, likeGroup o'rniga viewGroup —
  //      lekin mantiq bir xil: faqat property'lar, faqat shu foydalanuvchining tarixi

  const data: T = await this.viewModel
    // ↑                     bu yerda ham likeModel emas, VIEWMODEL ishlatiladi
    .aggregate([
      { $match: match },              // 3. filtrni qo'llash
      { $sort: { updatedAt: -1 } },   // 4. eng oxirgi ko'rilgan property birinchi bo'lib chiqishi uchun

      {
        $lookup: {                    // 5. "views"dan "properties"ga bog'lanish
          from: 'properties',
          localField: 'viewRefId',    //    Farqi: likeRefId emas, VIEWREFID (lekin vazifasi bir xil)
          foreignField: '_id',
          as: 'visitedProperty',      //    natija nomi ham farqli: favoriteProperty emas, visitedProperty
        },
      },
      { $unwind: '$visitedProperty' },
      // ↑ 6. massivni ochib, oddiy obyektga aylantirish (xuddi Favorites'dagidek)

      {
        $facet: {
          list: [
            { $skip: (page - 1) * limit },   // 7. sahifalash
            { $limit: limit },
            lookupVisit,                      // 8. property egasining profilini qo'shish (lookupFavorite'ning egizagi)
            { $unwind: '$visitedProperty.memberData' },  // 9. egasining ma'lumotini ochish
          ],
          metaCounter: [{ $count: 'total' }],  // 10. jami nechta ko'rilgan property borligini hisoblash
        },
      },
    ])
    .exec();

  const result: Properties = { list: [], metaCounter: data[0].metaCounter };
  // ↑ 11. bo'sh "list"li Properties obyekti tayyorlash

  result.list = data[0].list.map((ele) => ele.visitedProperty);
  // ↑ 12. har bir "views" hujjatidan faqat visitedProperty qismini olib, Property[] yasash

  return result;
  // ↑ 13. tayyor natijani qaytarish
}
```

**Bir qarashda solishtirish:** 1-4, 6-7, 9-13-qatorlar — **Favorites bilan so'zma-so'z bir xil mantiq**, faqat nomlar farqli. Haqiqiy "yangi" narsa — faqat 2 va 5-8-qatorlardagi collection/maydon nomlari (`likes`→`views`, `likeRefId`→`viewRefId`, `favoriteProperty`→`visitedProperty`).

**Diqqat qiling:** Bu kod — avvalgi `getFavoritesProperties`ning **deyarli bir xil nusxasi**, faqat: `likeModel` → `viewModel`, `likeRefId` → `viewRefId`, `favoriteProperty` → `visitedProperty`, `LikeGroup` → `ViewGroup`.

---

### Slayd 17 — Nega `viewGroup`/`likeGroup` filtri kerak (umumiy tushuncha)

**Prompt:**
"Konseptual slayd yarat, bitta collection'dan uch xil ma'lumot chiqishini ko'rsatuvchi diagram (Views collection → 3 ta filtr strelkasi → Member views, Property views, Article views). Sarlavha: 'Bitta jadval — uch xil ma\'lumot uchun'."

`likes` va `views` collection'lari — **member, property va article** uchun **bittagina, umumiy** jadval sifatida ishlatiladi (alohida-alohida emas). Buni ajratish uchun **`likeGroup`/`viewGroup`** maydoni bor (`MEMBER`, `PROPERTY`, `ARTICLE`).

`match: { viewGroup: ViewGroup.PROPERTY, memberId: memberId }` — bu qator: **"faqat property'larga tegishli, va aynan shu foydalanuvchining ko'rish tarixi"**ni tanlaydi, boshqa turdagi (member/article) ko'rishlarni chetlab o'tadi.

---

### Slayd 18 — To'liq zanjir va tuzatilgan xato

**Prompt:**
"Xato-tuzatish slaydi yarat, before/after formatida. Sarlavha: 'Zanjirni ulashda topilgan xato'."

**Berilgan (xato) kod** (`property.service.ts`):
```ts
public async getVisited(memberId: ObjectId, input: OrdinaryInquiry): Promise<Properties> {
  return await this.likeService.getFavoriteProperties(memberId, input);   // ❌
}
```

**Nega xato:** Bu — `getVisited` (ko'rilganlar) so'ralganda, aslida **`likeService`**ning (like/yoqtirish) metodini chaqirar edi — **butunlay boshqa ma'lumot** qaytarardi. Bundan tashqari, `getFavoriteProperties` (bu nom) — avvalroq `getFavoritesProperties`ga ("s" bilan) o'zgartirilgan edi, ya'ni bu chaqiruv **mavjud bo'lmagan metodni** chaqirar edi.

**Tuzatilgan kod:**
```ts
public async getVisited(memberId: ObjectId, input: OrdinaryInquiry): Promise<Properties> {
  return await this.viewService.getVisitedProperties(memberId, input);   // ✅
}
```

---

### Slayd 19 — Resolver darajasi

**Prompt:**
"Kod bloki slaydi yarat, guard'ga alohida e'tibor bilan. Sarlavha: 'property.resolver.ts — getVisited so\'rovi'."

```ts
@UseGuards(AuthGuard)
@Query((returns) => Properties)
public async getVisited(
  @Args('input') input: OrdinaryInquiry,
  @AuthMember('_id') memberId: ObjectId,
): Promise<Properties> {
  console.log('Query: getVisited');
  return await this.propertyService.getVisited(memberId, input);
}
```

**`@UseGuards(AuthGuard)`** — login **majburiy** (`WithoutGuard` emas). Mantiqiy: "men nimalarni ko'rganman" — bu **shaxsiy** ma'lumot, login qilmagan odam buni so'ray olmasligi kerak.

---

## QISM 5: UMUMIY NAQSH

### Slayd 20 — Uchta funksiya, bitta naqsh

**Prompt:**
"Katta diagram slaydi yarat — markazda 'Umumiy naqsh' yozuvi, atrofida 3 ta quti (meLiked/meFollowed, Favorites, Visited) ular orasida chiziqlar. Sarlavha: 'Bugun ko\'rgan barcha funksiyalarning umumiy skeleti'."

Bugun ko'rilgan **3 xil funksiya** (`meLiked` hisoblash, `Favorites`, `Visited Properties`) — barchasi **bitta umumiy g'oyaga** asoslangan:

1. **Kichik "bog'lovchi" hujjatdan boshlash** (`likes`/`views` — faqat ID'lar saqlanadi)
2. **`$lookup` orqali to'liq ma'lumotga bog'lash** (`properties`/`members` collection'idan)
3. **Kerak bo'lsa, ichki maydon bo'yicha yana bir `$lookup`** (masalan property egasining profili)
4. **`$facet` orqali sahifalash + umumiy son**ni bitta so'rovda olish
5. **Natijani client kutgan shaklga keltirish** (`$replaceRoot` yoki `.map()` orqali)

---

### Slayd 21 — Statistika

**Prompt:**
"Infographic slaydi yarat, katta raqamlar bilan. Sarlavha: '8-sentyabr — bir kunlik ish yakunlari'."

| Ko'rsatkich | Son |
|---|---|
| Tuzatilgan xatolar (`lookupAuthMemberLiked`) | 5 |
| Yangi ishga tushirilgan API (`getFavorites`, `getVisited`) | 2 |
| Yangi `$lookup` funksiyalari (`lookupFavorite`, `lookupVisit`) | 2 |
| Yangi servis metodlari | 2 |
| Topilib tuzatilgan noto'g'ri servis chaqiruvi | 1 (`getVisited` → `likeService` emas, `viewService`) |
| Bir xil naqsh asosida qurilgan funksiyalar | 3 (`meLiked`, Favorites, Visited) |

---

### Slayd 22 — Asosiy saboqlar

**Prompt:**
"Yakuniy saboqlar slaydi yarat, 5 ta karta bilan."

1. **`$` va `$$` — bir harflik farq, butunlay boshqa ma'noni bildiradi** — hujjat maydoni va `let`-o'zgaruvchini chalkashtirmaslik kerak
2. **Nomlar aniq mos kelishi shart** (`localMyFavourite` vs `localMyFavorite`) — imlo xatosi butun so'rovni yiqitadi
3. **Yaxshi naqsh — qayta ishlatiladi** — Favorites'ni yozib bo'lgach, Visited'ni yozish uchun deyarli faqat nom almashtirish kifoya qildi
4. **Copy-paste qilganda, ichki chaqiruvlarni ham yangilashni unutmang** — `getVisited` xato bilan `likeService`ni chaqirib turgan edi, chunki `getFavorites`dan nusxa olingan edi
5. **Aggregatsiya natijasini "tekislash" ikki xil yo'l bilan mumkin** — MongoDB darajasida (`$replaceRoot`) yoki JS darajasida (`.map()`) — ikkalasi ham to'g'ri, tanlov — kodni qayerda "o'qilishi osonroq" qilishga bog'liq

---

### Slayd 23 — Yakun

**Prompt:**
"Yopilish slaydi yarat, minimalistik. Sarlavha: 'Rahmat!'. Pastda: 'Barcha o\'zgarishlar TypeScript kompilyatsiyasi va real GraphQL so\'rovlari (signup → like/view → ro\'yxatni olish) orqali to\'liq tekshirilgan.' Sana: '8-sentyabr, 2026'."
