# GraphQL, Resolver va Nestar loyihasi — taqdimot (PPT) uchun mukammal prompt

Bu faylni taqdimot yaratuvchi AI vositaga (Gamma, Tome, Canva AI, yoki Claude/ChatGPT "slides" rejimiga) to'liq nusxalab bering. Agar vosita rasm yuklashni qo'llab-quvvatlasa, ilova qilingan diagramma-rasmni ham birga yuklang (2-QISM'ning 4-bo'limida uning to'liq yozma tavsifi ham berilgan — vosita rasmni o'qiy olmasa, o'sha tavsifdan foydalanadi).

---

## 1-QISM: AI VOSITASIGA BERILADIGAN PROMPT

```
Men NestJS + GraphQL + MongoDB texnologiyalari bilan backend o'rganayotgan
dasturchiman. Menga quyidagi 5 ta mavzuni chuqur, lekin sodda tilda
tushuntiruvchi, 20-24 slayddan iborat professional o'quv taqdimoti tuzib
ber.

Auditoriya: GraphQL va NestJS'ni endi o'rganayotgan boshlang'ich/o'rta
darajadagi backend dasturchilar.
Ohang: sodda, aniq, har bir texnik atamani kundalik hayotdan misol
(analogiya) bilan tushuntiradigan. Kod namunalari qisqa (5-10 qator)
bo'lsin.

Taqdimot tuzilishi:

BO'LIM 1 — Kirish (1 slayd)
  Sarlavha: "GraphQL, Resolver va NestJS: Nestar loyihasi misolida"

BO'LIM 2 — REST API va GraphQL: farqlari, kuchli va zaif tomonlari
  (4-5 slayd)
  - 2-QISM/1-bo'limdagi solishtirma jadval asosida
  - Alohida slayd: REST'ning AFZALLIKLARI (pros)
  - Alohida slayd: REST'ning KAMCHILIKLARI (cons)
  - Alohida slayd: GraphQL'ning AFZALLIKLARI (pros)
  - Alohida slayd: GraphQL'ning KAMCHILIKLARI (cons)
  - Diagramma: bitta so'rovda REST (bir nechta so'rov kerak) vs
    GraphQL (bitta so'rov) taqqoslash chizmasi

BO'LIM 3 — Sof GraphQL resolver vs NestJS dekorator-resolver (4-5 slayd)
  - 2-QISM/2-bo'lim asosida: bitta katta obyekt (resolvers.js) uslubi
    bilan @Resolver klass uslubini solishtir
  - ILOVA QILINGAN RASMNI shu yerda ishlat (yoki 2-QISM/4-bo'limdagi
    tavsifidan foydalanib qayta chiz): chapda "OLDIN — tartibsizlik",
    o'ngda "KEYIN — @Resolver bilan tartibli tuzilma"
  - Jadval: fayl tuzilishi, DI (Dependency Injection), Pipe/Guard
    qo'llab-quvvatlashi, turdagi xavfsizlik (type safety) bo'yicha farq

BO'LIM 4 — @Field() dekoratori nima va nega kerak (2-3 slayd)
  - 2-QISM/3-bo'lim asosida
  - Nestar loyihasidagi HAQIQIY misol bilan: memberPassword maydonida
    @Field yo'qligi sababli u GraphQL javobida HECH QACHON ko'rinmasligini
    ko'rsat (xavfsizlik nuqtai nazaridan muhim!)

BO'LIM 5 — Amaliy misol: Nestar loyihasidagi Signup va Login data flow
  (5-6 slayd)
  - 2-QISM/5-bo'limdagi bosqichlar asosida, ikkita alohida flow-chart
    (Signup uchun, Login uchun)
  - Har bir bosqichda qaysi fayl/qator ishlayotganini ko'rsat

BO'LIM 6 — Yakuniy xulosa (1 slayd)
  - Barcha 5 mavzuni bitta jumlada birlashtiruvchi xulosa

MUHIM TALABLAR:
1. Har bir mavzuda kamida bitta VIZUAL DIAGRAMMA yoki JADVAL bo'lsin —
   faqat matn bilan cheklanma.
2. Kod namunalarini TypeScript sintaksisida, syntax-highlighting bilan
   ko'rsat.
3. Texnik atama birinchi marta ishlatilganda qavs ichida 1 jumlali
   oddiy tildagi izoh ber.
4. BO'LIM 3'dagi solishtirishda ilova qilingan rasmdagi ranglash
   uslubini saqla: muammo = qizil, yechim = yashil.
```

---

## 2-QISM: TAQDIMOT MAZMUNI UCHUN MATERIAL (manba)

### 1-bo'lim: REST API va GraphQL — farqlari

| Mezon | REST API | GraphQL |
|---|---|---|
| Manzillar (endpoint) soni | Har bir resurs uchun alohida (`/users`, `/users/5/posts`) | Bitta (`/graphql`), amal so'rov ichida yoziladi |
| Qaytariladigan ma'lumot | Server belgilagan **hammasi** (over-fetching muammosi) | Client so'ragan **faqat shu** maydonlar |
| Bir nechta resursni olish | Ko'pincha bir nechta so'rov kerak (masalan foydalanuvchi + uning postlari — 2 ta so'rov, N+1 muammosi) | Bitta so'rovda ichma-ich (nested) barcha kerakli ma'lumotni olish mumkin |
| Versiyalash (versioning) | `/v1/users`, `/v2/users` kabi qo'lda versiyalanadi | Schema evolyutsiyasi orqali, ko'pincha versiyasiz rivojlanadi |
| O'rganish egri chizig'i | Past — HTTP metodlarini bilsangiz yetarli | O'rtacha — schema, type system, resolver tushunchalarini bilish kerak |
| Keshlash (caching) | Oson — HTTP'ning o'zida bor (`GET` so'rovlari brauzer/CDN darajasida keshlanadi) | Qiyinroq — har bir so'rov `POST` bo'lgani uchun standart HTTP keshlash ishlamaydi, maxsus vositalar kerak |
| Fayl yuklash (file upload) | Tabiiy qo'llab-quvvatlanadi (`multipart/form-data`) | Standart emas, qo'shimcha kutubxona kerak |

**REST'ning afzalliklari (pros):**
- Sodda, tushunish oson, ko'pchilik biladi
- HTTP keshlash tabiiy ishlaydi
- Fayl yuklash oson

**REST'ning kamchiliklari (cons):**
- Over-fetching (ortiqcha ma'lumot kelishi) va under-fetching (yetarli bo'lmasligi, qo'shimcha so'rov kerakligi)
- Ko'p resurs uchun ko'p so'rov (N+1 muammo)
- Versiyalash og'ir

**GraphQL'ning afzalliklari (pros):**
- Aynan kerakli ma'lumot — ortiqcha yo'q
- Bitta so'rovda bir nechta bog'liq ma'lumotni olish
- Kuchli schema va type-system — self-documenting (o'z-o'zini hujjatlashtiradi)

**GraphQL'ning kamchiliklari (cons):**
- Keshlashni sozlash qiyinroq
- O'rganish uchun ko'proq vaqt kerak
- Noto'g'ri yozilgan so'rov (juda chuqur nested query) serverga og'ir yuk berishi mumkin

---

### 2-bo'lim: Sof GraphQL resolver vs NestJS dekorator-resolver

**Sof GraphQL (masalan Apollo Server'ning o'zida):**
```js
const resolvers = {
  Mutation: {
    signup: (parent, args, context) => {
      // qo'lda DB ulanishini context'dan olish,
      // qo'lda validatsiya, qo'lda hamma narsa
    }
  }
};
```

**NestJS'da (Nestar loyihasidagi haqiqiy kod, `member.resolver.ts`):**
```ts
@Resolver()
export class MemberResolver {
  constructor(private readonly memberService: MemberService) {}

  @Mutation(() => Member)
  @UsePipes(ValidationPipe)
  public async signup(@Args('input') input: MemberInput): Promise<Member> {
    return await this.memberService.signup(input);
  }
}
```

| Jihat | Sof GraphQL | NestJS dekorator-resolver |
|---|---|---|
| Yozilish shakli | Oddiy obyekt/funksiya | Klass + dekorator (`@Resolver`, `@Mutation`) |
| Bog'liqliklarni olish | Qo'lda, `context` orqali | Avtomatik (Dependency Injection) |
| Schema qayerdan keladi | Alohida `.graphql` fayl, qo'lda mos kelishi kerak | TypeScript klasslardan avtomatik generatsiya (`code-first`) |
| Validatsiya/ruxsat tekshiruvi | Qo'lda yoziladi | Tayyor: `@UsePipes()`, `@UseGuards()` |
| Fayl tuzilishi (loyiha kattalashganda) | Hammasi bitta/bir nechta katta obyektga to'planadi | Har bir domen (feature) uchun alohida `.resolver.ts`, `.service.ts` fayllari |

**Ilova qilingan rasmning tavsifi (agar vosita rasmni o'qiy olmasa, shu tavsifdan foydalaning):**

Rasm ikki qismga bo'lingan:

*Chap qism — qizil, "OLDIN: Muammo (Sof GraphQL — Tartibsizlik)":* Bitta `resolvers.js` fayli ko'rsatilgan, unda `Query` obyekti ichida `user`, `users`, `userById`, `posts`, `postById`, `comments`, `likes`, `notifications`, `messages`, `conversations`, `search`, `analytics` va yana 100+ boshqa Query — hammasi **bitta joyda**. Xuddi shunday `Mutation` obyekti ichida `createUser`, `updateUser`, `deleteUser`, `createPost`, `updatePost`, `deletePost` va 100+ boshqa Mutation. Yonida chigal ip to'pi (tangled ball) rasmi va yopishqoq qog'ozchalar: "Qaysi funksiya qayerda?", "Qaysi faylga qo'shsam?", "Kodlar bir-biriga aralashib ketgan", "Topish va tushunish qiyin". Muammolar ro'yxati: fayl juda katta bo'lib ketadi, mantiqni topish qiyin, funksiyalar aralashadi, jamoaviy ishlash (parallel work) qiyin, yangi feature qo'shish xavfli, scalability yomon.

*O'ng qism — yashil, "KEYIN: Yechim (@Resolver — Tartibli va scalable)":* Har bir domen (`users/`, `posts/`, `comments/`) uchun alohida papka, ichida `*.resolver.ts`, `*.service.ts`, `*.entity.ts` fayllari — modulli (feature-based) tuzilma. Misol sifatida to'liq `UserResolver` klassi ko'rsatilgan (`@Query`, `@Mutation` dekoratorlari bilan). Strelka orqali "NestJS ularni avtomatik topadi → Schema'ga avtomatik qo'shadi → GraphQL server tayyor bo'ladi" jarayoni ko'rsatilgan. Afzalliklar: har bir resolver o'z domeniga tegishli, fayllar kichik va tushunarli, yangi feature qo'shish oson, jamoaviy ishlash oson, kod qayta ishlatiladi, scalability/maintainability/testability yaxshi.

*Pastda — qisqa taqqoslash jadvali:* Tuzilma, fayl hajmi, o'qish/tushunish qulayligi, yangi feature qo'shish xavfsizligi, jamoaviy ishlash, scalability, maintainability bo'yicha "OLDIN" va "KEYIN" ustunlari solishtirilgan — barcha mezonlarda "KEYIN" (@Resolver) ustun keladi.

*Yakuniy xulosa (rasmdan):* "@Resolver Decorator + Modulli tuzilma = Tartib, Oson boshqaruv, Yaxshi scalability."

**Muhim izoh:** Bu rasm asosan **fayl tuzilishi va loyiha miqyosidagi tartib** haqida (ya'ni ko'p domen bo'lganda kod qanday tarqalishi kerakligi). Bizning Nestar loyihamizda buning aynan mos ko'rinishi bor: `apps/nestar-api/src/components/member/` papkasida `member.resolver.ts`, `member.service.ts` alohida-alohida — xuddi rasmdagi "KEYIN" holatiga o'xshab, agar kelajakda `property`, `comment` kabi yangi domenlar qo'shilsa, ular ham xuddi shunday alohida papkalarga joylashadi (`components/property/`, `components/comment/` — bu papkalar allaqachon loyihada bor).

---

### 3-bo'lim: `@Field()` dekoratori nima va nega kerak

**Muammo:** TypeScript klassi shunday yozilgan:
```ts
@ObjectType()
export class Member {
  memberNick!: string;      // bu maydon GraphQL'da KO'RINMAYDI!
}
```
GraphQL — o'zining alohida **type system**iga ega, va u TypeScript kodini "o'qiy olmaydi" (chunki TypeScript kompilyatsiyadan keyin oddiy JavaScript'ga aylanadi, turlar haqidagi ma'lumot yo'qoladi — bu "type erasure" deb ataladi). Shuning uchun GraphQL'ga **qaysi maydon "tashqariga ko'rinishi kerak" va qanday turda** ekanligini **aniq aytish** kerak — buning uchun `@Field()` dekoratori ishlatiladi:

```ts
@Field(() => String)
memberNick!: string;
```

**`@Field(() => String)` ichidagi `() => String` nima uchun kerak (funksiya/thunk shaklida)?**
TypeScript turlari runtime'da (dastur ishlab turgan paytda) mavjud bo'lmagani uchun, GraphQL'ga turni **oddiy qiymat sifatida emas, funksiya (thunk) sifatida** berish kerak — bu funksiya chaqirilganda GraphQL kerakli paytda turni "so'rab oladi". Shu tarzda `MemberType`, `Date` kabi maxsus turlarni ham (hali to'liq aniqlanmagan bo'lsa ham) muammosiz ishlatish mumkin.

**Nestar loyihasidagi ENG YAXSHI real misol — xavfsizlik nuqtai nazaridan:**

`member.ts` faylida:
```ts
memberPassword?: string;   // @Field YO'Q!

@Field(() => String, { nullable: true })
memberFullName?: string;   // @Field BOR
```

Bu — **ataylab** qilingan! `memberPassword` maydonida `@Field()` yo'qligi sababli:
- Bu maydon TypeScript/JavaScript darajasida **mavjud** (`login()` metodida parolni solishtirish uchun ishlatiladi)
- Lekin GraphQL schema darajasida **umuman ko'rinmaydi** — client hech qanday so'rov bilan (`{ memberPassword }` deb so'rasa ham) uni ololmaydi, chunki u schema'da yo'q

**Xulosa:** `@Field()` — bu shunchaki "texnik talab" emas, balki **qaysi ma'lumotni tashqi dunyoga ochish, qaysisini yashirish** haqidagi **ongli qaror qabul qilish vositasi**. Xuddi uy old eshigidagi "kirish mumkin"/"kirish mumkin emas" belgilar kabi — TypeScript klassdagi HAR BIR maydon avtomatik "ochiq" bo'lib qolmaydi, faqat `@Field()` bilan belgilanganlari ochiladi.

---

### 4-bo'lim: Signup va Login — to'liq data flow (Nestar loyihasi misolida)

**SIGNUP oqimi:**

```
1. Client so'rov yuboradi:
   mutation Signup($input: MemberInput!) {
     signup(input: $input) { _id memberNick }
   }
   variables: { input: { memberNick, memberPassword, memberPhone } }
        |
        v
2. GraphQL dvigateli — "variables"ni MemberInput turiga solishtiradi
        |
        v
3. Pipe (@UsePipes(ValidationPipe)) — member.input.ts'dagi qoidalarni
   tekshiradi: @IsNotEmpty(), @Length(3,12) va h.k.
        |
        v
4. Resolver (member.resolver.ts, signup metodi) — input'ni qabul
   qiladi, MemberService.signup(input)ga uzatadi
        |
        v
5. Service (member.service.ts) — this.memberModel.create(input):
   - Mongoose standart qiymatlarni qo'shadi (memberType: USER,
     memberStatus: ACTIVE, memberAuthType: PHONE)
   - memberPhone/memberNick UNIQUE ekanligini MongoDB darajasida
     tekshiradi
        |
        v
6a. Muvaffaqiyatli bo'lsa: to'liq Member hujjati qaytadi
6b. Xato (E11000 — dublikat) bo'lsa: "Member already exists..."
    deb aniq xabar bilan BadRequestException tashlanadi
        |
        v
7. GraphQL dvigateli — client so'ragan maydonlarni (_id, memberNick)
   filtrlab, JSON javob qaytaradi
```

**LOGIN oqimi:**

```
1. Client so'rov yuboradi:
   mutation Login($input: LoginInput!) {
     login(input: $input) { _id memberNick memberType }
   }
   variables: { input: { memberNick, memberPassword } }
        |
        v
2. GraphQL dvigateli — LoginInput turiga tekshiradi
        |
        v
3. Pipe — @IsNotEmpty(), @Length(3,12)/@Length(5,12) tekshiradi
        |
        v
4. Resolver (login metodi) — MemberService.login(input)ga uzatadi
        |
        v
5. Service — memberModel.findOne({ memberNick })
             .select('+memberPassword').exec()
   MUHIM: memberPassword sxemada { select: false } deb belgilangan,
   shuning uchun uni ATAYLAB qo'shimcha .select('+memberPassword')
   bilan majburan olib kelish kerak
        |
        v
6. Holat tekshiruvlari (ketma-ket):
   - Topilmadimi yoki o'chirilganmi? -> NO_MEMBER_NICK xatosi
   - Bloklanganmi? -> BLOCKED_USER xatosi
        |
        v
7. Parolni solishtirish: memberPassword === response.memberPassword
   (hozircha oddiy solishtirish — parol hali hash qilinmagan,
   kelajakda bcrypt.compare() bilan almashtirilishi kerak)
   Mos kelmasa -> WRONG_PASSWORD xatosi
        |
        v
8. To'liq Member hujjati qaytadi — lekin memberPassword maydonida
   @Field() yo'qligi uchun (3-bo'limga qarang), u GraphQL javobida
   AVTOMATIK yashirin qoladi, client uni hech qachon ko'rmaydi
        |
        v
9. GraphQL dvigateli client so'ragan maydonlarni (_id, memberNick,
   memberType) filtrlab qaytaradi
```

**Ikkalasining umumiy naqshi:**
```
Validatsiya (Pipe) → Resolver (yo'naltiruvchi) → Service (haqiqiy ish) → natija/xato
```
Farqi: `signup` — yangi yozuv **yaratadi** (`create`), `login` — mavjud yozuvni **qidiradi va tekshiradi** (`findOne` + solishtirish).

---

## 3-QISM: TAVSIYA ETILGAN QO'SHIMCHA CHARTLAR

1. **REST vs GraphQL so'rov soni diagrammasi** — bir xil vazifa uchun (foydalanuvchi + uning postlarini olish) REST'da 2 ta alohida so'rov, GraphQL'da 1 ta so'rov kerakligini ko'rsatuvchi yonma-yon chizma
2. **"OLDIN/KEYIN" fayl tuzilmasi diagrammasi** — ilova qilingan rasmdagi ko'rinishni asos qilib, ammo Nestar loyihasining haqiqiy `components/` papka tuzilmasi bilan moslashtirilgan versiyasi
3. **@Field bor/yo'q taqqoslash sxemasi** — `Member` klassidagi barcha maydonlarni ikki ustunga ajratib ko'rsatuvchi jadval: "GraphQL'da ko'rinadi" (✅ @Field bor) va "Faqat backend ichida" (❌ @Field yo'q — masalan `memberPassword`)
4. **Signup va Login flow-chart'lari** — 2-QISM/4-bo'limdagi ikkita oqimni alohida-alohida vertikal flow-chart ko'rinishida
