# Authentication va Authorization — Excalidraw diagramma prompt

Bu faylning matnini to'liq nusxalab, Claude'ning brauzer kengaytmasiga (Excalidraw generatsiya qiluvchi) joylashtiring. Diagramma 20-avgustda Nestar loyihasiga qo'shilgan **Authentication (kim ekanligini aniqlash)** va **Authorization (nimaga huquqi borligini aniqlash)** tizimining to'liq data flow'ini, aniq fayl nomlari, qisqa kod parchalari va strelkalar bilan ko'rsatishi kerak.

---

## EXCALIDRAW PROMPT (shu yerdan pastini nusxalang)

```
Menga NestJS + GraphQL loyihasining Authentication va Authorization
tizimini ko'rsatuvchi katta, aniq, o'quv maqsadidagi Excalidraw
diagrammasi chizib ber. Diagramma ikkita katta gorizontal zonaga
bo'linsin: yuqorida "AUTHENTICATION OQIMI" (ko'k rang doirasi),
pastda "AUTHORIZATION OQIMI" (to'q sariq rang doirasi). Har bir
qutida fayl nomi (qalin, monospace shrift) va ichida 2-4 qatorlik
qisqa kod parchasi yoki tushuntirish bo'lsin. Qutilar orasida
YO'NALTIRILGAN STRELKALAR bo'lsin, har bir strelka ustida NIMA
UZATILAYOTGANI yozilgan bo'lsin (masalan "input: MemberInput",
"JWT token (string)", "authMember obyekti").

=====================================================================
ZONA 1: AUTHENTICATION OQIMI (yuqori qism, ko'k ramka bilan
belgilangan katta konteyner, sarlavha: "AUTHENTICATION — kim
ekanligini aniqlash")
=====================================================================

Bu zona ichida UCHTA gorizontal qator (sub-flow) bo'lsin:

--- 1-QATOR: SIGNUP (ro'yxatdan o'tish) ---

Quti 1 [yashil, dumaloq burchak]: "CLIENT (Postman)"
  Matn: "mutation signup(input: MemberInput)"

Strelka Quti1 -> Quti2, ustida yozuv: "input { memberNick,
memberPassword, memberPhone }"

Quti 2: "member.resolver.ts — signup()"
  Kod: "public async signup(@Args('input') input: MemberInput)
  { return this.memberService.signup(input); }"
  Izoh (kichik sarg'ish stikker sifatida yonida): "Faqat qabul
  qiladi va Service'ga yo'naltiradi, o'zi ish qilmaydi"

Strelka Quti2 -> Quti3, ustida yozuv: "input"

Quti 3: "member.service.ts — signup()"
  Kod: "input.memberPassword = await authService.hashPassword(...)
  const result = await memberModel.create(input)
  result.accessToken = await authService.createToken(result)"

Strelka Quti3 -> Quti4 (pastga tushuvchi tarmoq #1), yozuv:
  "memberPassword (xom matn)"

Quti 4: "auth.service.ts — hashPassword()"
  Kod: "const salt = await bcrypt.genSalt();
  return await bcrypt.hash(memberPassword, salt);"
  Izoh: "bcryptjs kutubxonasi — parolni qaytarib bo'lmas holda
  shifrlaydi"

Strelka Quti4 -> qaytib Quti3ga, yozuv: "hash qilingan parol"

Strelka Quti3 -> Quti5 (pastga tushuvchi tarmoq #2), yozuv:
  "to'liq Member hujjati (result)"

Quti 5 [ko'k, MongoDB ikonkasi bilan]: "MongoDB — members
  kolleksiyasi"
  Izoh: "memberModel.create(input) shu yerga yozadi"

Strelka Quti3 -> Quti6 (pastga tushuvchi tarmoq #3), yozuv:
  "result (yaratilgan Member)"

Quti 6: "auth.service.ts — createToken()"
  Kod: "const payload = {...member fields...};
  return await jwtService.signAsync(payload);"
  Izoh: "SECRET_TOKEN (.env) bilan imzolangan JWT yaratadi,
  30 kun amal qiladi (auth.module.ts'dagi JwtModule.register
  sozlamasi)"

Strelka Quti6 -> Quti3, yozuv: "JWT token (string)"

Strelka Quti3 -> Quti1 (yuqoriga qaytish, boshqa rangda, yashil),
  yozuv: "Member { _id, memberNick, ..., accessToken: JWT }"

--- 2-QATOR: LOGIN (kirish) ---

Quti 7 [yashil]: "CLIENT (Postman)"
  Matn: "mutation login(input: LoginInput)"

Strelka Quti7 -> Quti8, yozuv: "input { memberNick,
  memberPassword }"

Quti 8: "member.resolver.ts — login()"

Strelka Quti8 -> Quti9, yozuv: "input"

Quti 9: "member.service.ts — login()"
  Kod: "const response = await memberModel.findOne({memberNick})
  .select('+memberPassword');
  const isMatch = await authService.comparePassword(...)
  response.accessToken = await authService.createToken(response)"

Strelka Quti9 -> Quti10 (MongoDB), yozuv: "memberNick bo'yicha
  qidiruv"
Strelka Quti10 -> Quti9, yozuv: "topilgan hujjat (memberPassword
  bilan birga — chunki sxemada select:false)"

Quti 10 [ko'k, MongoDB ikonkasi]: "MongoDB — members kolleksiyasi"

Strelka Quti9 -> Quti11, yozuv: "kiritilgan parol + bazadagi
  hash"

Quti 11: "auth.service.ts — comparePassword()"
  Kod: "return await bcrypt.compare(password, hashedPassword);"
  Izoh: "true/false qaytaradi, hash'ni qayta hisoblamaydi"

Strelka Quti11 -> Quti9, yozuv: "true / false"

Strelka Quti9 -> Quti7, yozuv: "Member { ..., accessToken: JWT }
  yoki xato (WRONG_PASSWORD / BLOCKED_USER / NO_MEMBER_NICK)"

--- 3-QATOR: AUTHENTICATED SO'ROV (token bilan kirish, masalan
updateMember) ---

Quti 12 [yashil]: "CLIENT (Postman)"
  Matn: "Header: Authorization: Bearer <JWT>"

Strelka Quti12 -> Quti13, yozuv: "HTTP so'rov + Bearer token"

Quti 13 [to'q sariq, QALQON ikonkasi bilan — bu GUARD ekanini
  bildirish uchun]: "auth.guard.ts — AuthGuard.canActivate()"
  Kod: "const token = bearerToken.split(' ')[1];
  const authMember = await authService.verifyToken(token);
  if (!authMember) throw UnauthorizedException;
  request.body.authMember = authMember;
  return true;"
  Izoh: "Bu — Resolver metodi ISHGA TUSHISHIDAN OLDIN ishlaydi
  (@UseGuards(AuthGuard) orqali ulanadi)"

Strelka Quti13 -> Quti14, yozuv: "token (string)"

Quti 14: "auth.service.ts — verifyToken()"
  Kod: "const member = await jwtService.verifyAsync(token);
  member._id = shapeIntoMongoObjectId(member._id);
  return member;"
  Izoh: "JWT imzosini SECRET_TOKEN bilan tekshiradi, muddati
  o'tgan/soxta bo'lsa xato beradi"

Strelka Quti14 -> Quti13, yozuv: "authMember obyekti (yoki xato)"

Strelka Quti13 -> Quti15 (agar ruxsat bo'lsa, YASHIL strelka,
  yorlig'i "RUXSAT — return true"), 
  agar ruxsat bo'lmasa Quti13'dan alohida QIZIL strelka chiqib
  to'g'ridan-to'g'ri Quti12ga qaytsin, yorlig'i: "RAD ETILDI —
  401/400 xato"

Quti 15: "member.resolver.ts — updateMember()"
  Kod: "public async updateMember(@AuthMember('_id') memberId)"
  Izoh: "@AuthMember() dekorator (authMember.decorator.ts)
  request.body.authMember'dan kerakli maydonni chiqarib beradi"

=====================================================================
ZONA 2: AUTHORIZATION OQIMI (pastki qism, TO'Q SARIQ ramka bilan
belgilangan katta konteyner, sarlavha: "AUTHORIZATION — nimaga
huquqi borligini aniqlash (Authentication ustiga qo'shimcha
qatlam)")
=====================================================================

Bu zonani Zona 1'ning pastida joylashtir, va ikkalasi orasida
katta yo'g'on strelka bilan bog'la, yozuv: "Authorization —
Authentication'dan KEYIN, uning USTIGA qo'shiladigan qo'shimcha
tekshiruv"

Quti 16 [yashil]: "CLIENT (Postman)"
  Matn: "mutation getAllMembersByAdmin
  Header: Authorization: Bearer <JWT>"

Strelka Quti16 -> Quti17

Quti 17: "member.resolver.ts — getAllMembersByAdmin()"
  Kod: "@Roles(MemberType.ADMIN)
  @UseGuards(RolesGuard)
  @Mutation(() => [Member])
  public async getAllMembersByAdmin(...)"
  Izoh (alohida kichik quti, sariq stikker): "@Roles(...) —
  bu shunchaki 'YORLIQ' (metadata) yopishtiradi, HECH NARSANI
  tekshirmaydi!"

Strelka Quti17 -> Quti18 (ikkita alohida yo'nalish bilan,
  raqamlangan: "1-qadam" va "2-qadam")

Quti 18 [to'q sariq, QALQON ikonkasi]: "roles.guard.ts —
  RolesGuard.canActivate()"
  Kod-1: "const roles = reflector.get('roles',
  context.getHandler());
  if (!roles) return true; // yorliq yo'q — himoyasiz o'tadi!"
  Kod-2: "const authMember = await authService.verifyToken(token);
  const hasRole = () => roles.indexOf(authMember.memberType) > -1;
  if (!hasPermission) throw ForbiddenException;"
  Izoh: "1-qadam: reflector orqali @Roles yorlig'ini o'qiydi.
  2-qadam: AuthGuard bilan BIR XIL usulda tokenni tekshiradi
  (auth.service.ts — verifyToken), SO'NG QO'SHIMCHA ravishda
  authMember.memberType roldagi ro'yxatda ('ADMIN') bor-yo'qligini
  tekshiradi"

Strelka Quti18 -> Quti19 (kichik quti, pastda): "roles.decorator.ts
  — Roles()"
  Kod: "export const Roles = (...roles: string[]) =>
  SetMetadata('roles', roles);"
  Izoh: "@Roles(MemberType.ADMIN) yozilganda, shu funksiya
  ishlaydi va metodga 'roles: [ADMIN]' degan yorliqni yopishtiradi"
  (Bu qutini Quti17'dan Quti18'ga boradigan strelka yonida,
  pastroqda, punktir chiziq bilan bog'lab qo'y — chunki bu
  build vaqtida, so'rov kelishidan OLDIN sodir bo'ladi)

Strelka Quti18 -> Quti20, shart bilan ikkiga bo'linsin:
  YASHIL yo'l (yorliq: "memberType mos keldi — RUXSAT"):
    Quti20 [yashil]: "member.service.ts — getAllMembersByAdmin()"
    Kod: "return await memberModel.find().exec();"
    Strelka Quti20 -> MongoDB (Quti5/10 bilan bir xil belgi
    ishlatsa bo'ladi, yoki yangi kichik MongoDB qutisi)
    Strelka qaytib Quti16ga: "Member[] ro'yxati"

  QIZIL yo'l (yorliq: "memberType mos kelmadi — RAD ETILDI"):
    Quti21 [qizil]: "ForbiddenException:
    ONLY_SPECIFIC_ROLES_ALLOWED"
    Strelka Quti21 -> Quti16, yozuv: "403 xato"

=====================================================================
QO'SHIMCHA: YONDA KICHIK "LEGEND" (BELGILAR IZOHI) QUTISI
=====================================================================

Diagrammaning pastki chap burchagida kichik ramka ichida:
- Yashil quti = Client / muvaffaqiyatli natija
- Ko'k quti = Resolver yoki Service (biznes-logika)
- To'q sariq quti (qalqon ikonkasi) = Guard (himoya qatlami)
- Qizil quti/strelka = xato / rad etish
- Punktir strelka = build vaqtida (dekorator orqali) metadata
  yopishtirish, so'rov vaqtida emas

=====================================================================
UMUMIY USLUB KO'RSATMALARI
=====================================================================
- Barcha kod matnlari monospace shriftda, kichikroq o'lchamda
- Fayl nomlari QALIN va rangli fon bilan ajratilsin
- Har bir katta zona (Authentication / Authorization) atrofida
  yupqa, uzun to'rtburchak ramka, ustida katta sarlavha
- Strelkalar ingichka, lekin yorliq matni aniq o'qilishi uchun
  fon rangi (oq/och sariq) bilan ajratilsin
- Diagramma juda zich bo'lib ketmasligi uchun, qatorlar orasida
  yetarli bo'sh joy qoldir
```

---

## Diagrammada aks etadigan asosiy tushunchalar (qisqa eslatma)

- **Authentication (signup/login/AuthGuard)** — "sen kimsan?" degan savolga javob beradi. JWT token yaratish (`createToken`) va tekshirish (`verifyToken`) shu yerda.
- **Authorization (RolesGuard + @Roles)** — "senga bu ishni qilishga ruxsat bormi?" degan savolga javob beradi. Authentication ALLAQACHON muvaffaqiyatli o'tgan bo'lishi kerak (token tekshiriladi), SHUNDAN KEYIN qo'shimcha ravishda foydalanuvchining roli (`memberType`) tekshiriladi.
- **Guard va Decorator farqi:** `@Roles(...)` — decorator, faqat "yorliq" qo'yadi (metadata), hech qanday tekshiruv qilmaydi. `RolesGuard` — guard, aynan shu yorliqni o'qib, haqiqiy tekshiruvni bajaradi. Ikkalasi HAR DOIM birga ishlatiladi (`@Roles(...)` + `@UseGuards(RolesGuard)`), biri ikkinchisisiz ma'nosiz.
