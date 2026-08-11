# Research: техническая реализация загрузки файлов встреч

**План:** docs/plan-meeting-file-upload-and-display.md
**PRD:** docs/prd-meeting-file-upload-and-display.md
**Дата:** 2026-08-10

Стек подтверждён по коду: NestJS 11 (`@nestjs/platform-express`), Prisma 6.19.3/Postgres, Next.js 16 / React 19 (только fetch-клиент к отдельному API, без Next API routes). Ниже — конкретные технические решения и обоснования для каждого пункта плана, включая нюансы `multer`, которые в самом плане не расписаны, но влияют на выполнение acceptance criteria PRD.

## Итог одним абзацем

Использовать `multer.diskStorage` (не `memoryStorage`) с server-generated именами файлов на диске и плоской структурой каталога `uploads/<uuid>` (без вложенности по `meetingId` — это упрощает создание директорий). `fileFilter` обязан вызывать `cb(error)`, а не `cb(null, false)` — иначе плохой файл в батче будет тихо пропущен вместо отказа всему запросу. Очистку уже записанных на диск файлов при отказе батча **делает сам multer** (`DiskStorage._removeFile`) — отдельный код для этого не нужен. Guard авторизации должен выполняться до `FilesInterceptor` (порядок Nest-пайплайна это гарантирует), поэтому неавторизованные запросы не долетают до диска. Для скачивания — `StreamableFile` с RFC5987-кодированием `Content-Disposition`, т.к. оригинальное имя файла — непроверенный ввод пользователя. При удалении файла порядок «сначала БД, потом diск» делает список файлов согласованным источником истины даже если unlink не удался.

---

## Phase 1 — модель данных, загрузка, список, скачивание

### 1.1 Prisma-модель `MeetingFile`

Паттерн уже задан существующими моделями (`Meeting`, `MeetingParticipant` — `onDelete: Cascade` на обеих FK, `@@index` на FK-полях). Симметрично:

```prisma
model MeetingFile {
  id             String   @id @default(uuid())
  meetingId      String
  meeting        Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  uploadedById   String
  uploadedBy     User     @relation(fields: [uploadedById], references: [id], onDelete: Cascade)
  filename       String   // оригинальное имя от клиента, для отображения/скачивания — недоверенный ввод
  storedName     String   @unique // сгенерированное на сервере имя на диске (uuid), никогда не показывается
  mimeType       String
  size           Int
  createdAt      DateTime @default(now())

  @@index([meetingId])
  @@map("meeting_file")
}
```

Плюс обратные relation-поля `files MeetingFile[]` на `Meeting` и `User`. Применять стандартным путём из `apps/api/CLAUDE.md`: `npx prisma migrate dev --name add_meeting_file` — ручное написание SQL не требуется, Prisma сгенерирует его из diff схемы; «hand-write» в плане, вероятно, означает «написать модель руками в schema.prisma», а не писать raw SQL миграцию.

`storedName` как отдельное уникальное поле — ключевое решение (см. 1.3): оригинальное имя никогда не используется как путь на файловой системе.

### 1.2 Выбор `diskStorage` vs `memoryStorage`

Multer по умолчанию буферизует файл целиком в `Buffer` в памяти процесса, если не передан `storage`/`dest`. При нескольких параллельных загрузках это прямой риск OOM на процессе API. `diskStorage` пишет входящий поток сразу на диск без полной буферизации в памяти — это обязательный выбор, а не опция, при работе с произвольными пользовательскими файлами. План уже фиксирует это ("multer disk-storage config") — важно не откатиться на `dest: './uploads'` (строковый вариант без кастомной `filename`), потому что тогда имена на диске будут случайными служебными (это ок), но тогда придётся отдельно генерировать `storedName` для БД — проще сразу задать `diskStorage({ destination, filename })` и использовать то же сгенерированное имя и для файла на диске, и как `storedName` в БД.

### 1.3 Именование файлов на диске и защита от path traversal

Оригинальное `file.originalname` — недоверенный ввод клиента. Использовать его как часть пути на диске — прямой риск path traversal (`../../etc/passwd`) и коллизий имён. Решение:

- `filename` callback в `diskStorage` генерирует `storedName = crypto.randomUUID()` (без расширения — расширение не нужно на диске, `Content-Type` при отдаче берётся из сохранённого `mimeType`, а не из расширения файла).
- Каталог — плоский `uploads/<storedName>`, **не** `uploads/<meetingId>/<storedName>`. Причина: со строковым `destination` (`(req, file, cb) => cb(null, uploadsDir)`) multer сам создаёт каталог, если его нет; с функцией, возвращающей путь, зависящий от `meetingId`, вложенные каталоги создавать пришлось бы вручную (`fs.mkdirSync(dir, { recursive: true })`) в каждом вызове `destination`. Плоская структура убирает этот код целиком и не теряется в функциональности — принадлежность файла встрече и так задаётся через `meetingId` в БД, а не через файловую систему.
- Оригинальное `filename` хранится в БД только как метаданные для отображения и для `Content-Disposition` при скачивании — см. 1.5 про его безопасное кодирование там.
- `uploads/` — путь резолвить абсолютно (`path.join(process.cwd(), 'uploads')` или через `ConfigService`/env-переменную), не полагаться на относительный cwd, который отличается между `nest start` (из `apps/api/`) и потенциальным запуском из другого рабочего каталога.

### 1.4 `fileFilter`, лимиты и семантика «весь батч отклоняется, если хоть один файл невалиден»

Это самое нетривиальное место в Phase 1, и в плане технический риск не проговорён явно.

**Ошибка, которую легко допустить:** `fileFilter(req, file, cb)` принимает файл через `cb(null, true)`, отклоняет **молча** через `cb(null, false)` (файл просто не попадёт в `req.files`, запрос продолжится успешно с оставшимися файлами) и отклоняет **с ошибкой** через `cb(new Error(...))` (весь запрос падает с ошибкой). PRD требует: "мixed batch (one valid, one invalid) rejects the whole batch" — значит `fileFilter` обязан вызывать `cb(error)`, а не `cb(null, false)`, при недопустимом MIME-типе. `cb(null, false)` даст противоположное поведение (частичный успех) и тихо провалит acceptance criteria.

**Очистка уже записанных файлов при отказе — не нужно писать руками.** Когда `fileFilter` или лимит (`limits.fileSize`/`limits.files`) обрывает обработку батча ошибкой, multer сам вызывает `_removeFile` у storage-движка для всех файлов текущего запроса, которые уже были записаны (`DiskStorage._removeFile` делает `fs.unlink` внутри). Это задокументированное поведение самого multer (`StorageEngine.md`: «Multer determines which files to remove and when»), а не то, что нужно реализовывать в контроллере/сервисе. Соответственно, если 2-й файл из 3 отклонён `fileFilter`, файл №1, уже полностью записанный на диск к этому моменту, будет автоматически удалён multer'ом до того, как ошибка долетит до Nest-обработчика — на диске после отказа ничего не останется, что и требует PRD ("no partial file is stored"). Никаких DB-записей тоже не будет, так как тело контроллера не выполняется при ошибке в интерцепторе.

**Лимиты (`limits` в multer options):**

| Опция      | Назначение                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `fileSize` | максимальный размер одного файла в байтах — enforced потоково (busboy обрывает stream по превышении, не дожидаясь конца файла) |
| `files`    | максимальное число файлов в запросе                                                                                            |

Оба варианта отказа (`fileFilter` error и превышение `limits`) всплывают как `MulterError` с разными `code` (`LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`, `LIMIT_UNEXPECTED_FILE`) либо как обычная `Error`, если `fileFilter` вызвал `cb(new Error(...))` вручную для MIME-allowlist. План уже предусматривает "exception filter mapping multer's size/count errors to proper 4xx responses" — нужен `@Catch(MulterError)` фильтр, плюс отдельная обработка кастомной ошибки MIME-allowlist (либо тоже через `MulterError`-совместимый код, либо через `BadRequestException`, если `fileFilter` бросает `new BadRequestException(...)`, что Nest и так штатно превратит в 400 без доп. фильтра — это даже проще, чем городить свой код ошибки).

**Опциональная настройка multer:** т.к. лимиты захардкожены (не идут через `ConfigService`), не нужен `MulterModule.registerAsync`; достаточно завести один экспортируемый объект `multerOptions: MulterOptions` в модуле файлов и передавать его третьим аргументом в `FilesInterceptor('files', MAX_FILES, multerOptions)`. Так и планировалось делать по факту (build a multer disk-storage config) — здесь просто подтверждение, что DI/async-конфигурация не нужна и не даст выгоды при хардкоде.

### 1.5 `MeetingFileAccessGuard` и порядок выполнения относительно `FilesInterceptor`

В Nest request pipeline порядок фиксирован: **Guards → Interceptors (pre-controller) → Pipes → Handler**. Значит `@UseGuards(JwtAuthGuard, MeetingFileAccessGuard)` гарантированно отработает **до** того, как `FilesInterceptor` начнёт разбирать multipart-тело и писать что-либо на диск. Это важно: неавторизованный пользователь получит 404 (текущий паттерн доступа — namespace-скрытие, не 403, см. `MeetingService.findOne`) до того, как API потратит время/диск на приём его файлов — не нужно отдельно заботиться об «откате» уже принятых файлов чужого запроса, эта ситуация вообще не возникает.

Текущая проверка доступа зашита прямо в Prisma-запрос `MeetingService.findOne` (`where: { id, OR: [{ownerId: userId}, {participants: {some: {userId}}}] }`) и не вынесена в переиспользуемый метод. Чтобы честно «reuse the existing owner-or-participant access rule» (как написано в плане), стоит выделить в `MeetingService` лёгкий метод вида:

```ts
async hasAccess(meetingId: string, userId: string): Promise<boolean> {
  const count = await this.prisma.meeting.count({
    where: { id: meetingId, OR: [{ ownerId: userId }, { participants: { some: { userId } } }] },
  });
  return count > 0;
}
```

и вызывать его и из `MeetingFileAccessGuard` (инжектя `MeetingService` через DI — guard'ы полноценные Nest-провайдеры), и переиспользовать в `findOne` при желании (не обязательно для этого таска, но избегает дублирования одного и того же условия `OR` в двух местах, которое иначе разойдётся при следующей правке модели участников). `count` дешевле, чем `findFirst` с `include` — guard'у не нужны данные о встрече, только факт доступа.

Guard должен доставать `meetingId` из `request.params.meetingId` (или `.id`, в зависимости от того, как назовут параметр маршрута — план называет его `:meetingId`, у существующего `MeetingController` параметр называется `:id`; стоит сохранить единообразие с `:id`, если контроллер файлов вложен в тот же роутинг под `/meetings/:id/files`, либо явно задокументировать расхождение, если разработчик решит использовать `:meetingId`).

### 1.6 Скачивание: `StreamableFile` + безопасный `Content-Disposition`

NestJS-паттерн — `StreamableFile` (а не `res.pipe()` напрямую), потому что он не ломает post-controller interceptor логику (см. официальную доку `techniques/streaming-files`). Путь к файлу на диске строится **только** из `storedName`, хранящегося в БД (server-generated UUID) — то есть из проверенного значения, а не из URL-параметра или заголовка, так что path traversal через путь на диске исключён по конструкции, а не проверкой.

Важный нюанс безопасности, которого нет в тексте плана: оригинальное `filename` — недоверенный ввод, и он попадает в `Content-Disposition` заголовок ответа при скачивании (`attachment; filename="<original>"`). Имя файла может содержать кавычки, переводы строк, не-ASCII символы — это способ сломать заголовок или получить неожиданное поведение браузера при сохранении файла. Решение — RFC 5987-кодирование:

```ts
res.set({
  'Content-Type': file.mimeType,
  'Content-Disposition': `attachment; filename="${asciiFallback(file.filename)}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
});
```

где `asciiFallback` — грубая замена не-ASCII/спецсимволов на `_` для старых клиентов, а `filename*` — корректно закодированное UTF-8 имя для современных браузеров. Это и есть та самая «filename-sanitizing helper», упомянутая в плане для загрузки — на деле она нужна не столько на входе (там имя просто ложится в БД как строка), сколько на выходе, при формировании заголовка скачивания.

### 1.7 Доверие к MIME-типу — известное ограничение, а не баг

`file.mimetype`, который multer кладёт в `req.files`, берётся из `Content-Type` конкретной part multipart-запроса, то есть это то, что **заявил клиент** (браузер на основе расширения файла), а не что-либо просканированное по содержимому. Allowlist по этому полю тривиально обходится переименованием файла или ручной сборкой multipart-запроса с произвольным `Content-Type`. Для этой итерации (out of scope: virus scanning/content analysis по PRD) это приемлемо и соответствует объёму задачи — но стоит явно зафиксировать это как границу, а не как случайно забытую проверку: honest content-sniffing потребовал бы библиотеки вроде `file-type`, читающей magic bytes, что в PRD прямо исключено.

---

## Phase 2 — удаление файла

### 2.1 Порядок операций: БД первой, диск — best effort

Два возможных порядка:

- **Диск → БД:** если unlink успешен, но следующий шаг (Prisma delete) упадёт — в БД останется запись на файл, которого физически уже нет. Список файлов покажет "файл", скачивание такого файла даст 500/ENOENT вместо ожидаемого поведения. Хуже для пользователя, чем небольшой мусор на диске.
- **БД → диск (рекомендуется):** удалить строку `MeetingFile` в Prisma первой; при успехе — `fs.unlink(path)` как best-effort, с `.catch()`, который просто логирует (включая `ENOENT`, если файл уже отсутствовал — не считать это ошибкой операции). Если Prisma delete падает — ничего не удалено, состояние консистентно, пользователь получит ошибку и может повторить попытку. Если unlink после успешного удаления строки падает — список файлов (источник истины — БД) уже корректен, физический мусор на диске — эксплуатационная, не пользовательская проблема, и не блокирует ни один acceptance criterion PRD.

Это симметрично тому, как уже устроены существующие "мягкие" операции в `MeetingService` (например `removeParticipant` полагается на `deleteMany`+`count` без дополнительной проверки существования файла на диске до удаления записи).

### 2.2 Права на удаление

Проверка "uploader OR meeting owner" — это уже не тот же guard, что в Phase 1 (там "owner OR any participant"), а более узкое условие. Разумно не пытаться впихнуть обе проверки в один guard с разной логикой на разные методы контроллера — оставить `MeetingFileAccessGuard` для upload/list/download (широкий доступ), а для delete сделать проверку прямо в сервисе (`file.uploadedById !== userId && meeting.ownerId !== userId → ForbiddenException`), по аналогии с тем, как `getOwnedMeeting` в `MeetingService` уже делает ad-hoc проверку прав внутри сервисного метода, а не через отдельный guard. Так меньше guard'ов с частично пересекающейся, но не идентичной логикой.

---

## Phase 3 — веб (frontend)

### 3.1 Загрузка: `FormData`, без ручного `Content-Type`

`fetch(url, { method: 'POST', headers: { Authorization: ... }, body: formData })` — **не** ставить `Content-Type` вручную: браузер сам выставит `multipart/form-data; boundary=...`, а ручной заголовок без `boundary` сломает парсинг на бэкенде. Для нескольких файлов — несколько `formData.append('files', file)` под одним и тем же именем поля, соответствующим `FilesInterceptor('files', ...)` на бэкенде.

### 3.2 «Progress feedback» — реальный % через `fetch` недоступен

PRD формулирует "upload control (with progress/error feedback)", план сужает это до "busy/error state" — это осознанное упрощение, и его стоит подтвердить явно: обычный `fetch` не даёt событий прогресса загрузки тела запроса (`fetch` отслеживает только прогресс _скачивания_ ответа через `ReadableStream`, не _отправки_ тела). Настоящий % прогресса загрузки потребовал бы `XMLHttpRequest.upload.onprogress` (переход с fetch на XHR только для этого эндпоинта) либо fetch с потоковым телом и `duplex: 'half'` (ограниченная поддержка в браузерах на 2026 год). Учитывая, что файлы ограничены серверным лимитом размера (скорее всего единицы–десятки МБ, раз это документы/изображения для встречи, не видео), busy-спиннер без процентов — разумный компромисс, соответствующий тому, что уже написано в плане, и не стоит расширять до XHR без явного запроса.

### 3.3 Скачивание с `Authorization`-заголовком: blob + временный object URL

Прямая ссылка `<a href="/meetings/:id/files/:fileId">` не может нести `Authorization`-заголовок — эндпоинт защищён `JwtAuthGuard`, значит обычная навигация браузера (без заголовка) получит 401. План уже фиксирует решение: `fetch` с заголовком → `res.blob()` → `URL.createObjectURL(blob)` → временный `<a>` с `download`-атрибутом → клик → `URL.revokeObjectURL` сразу после (или на `setTimeout(0)`, чтобы браузер успел начать скачивание до отзыва URL). Единственный нюанс: имя файла для сохранения нужно передать явно в `download="<filename>"` на клиенте (сам `Content-Disposition` заголовок ответа не влияет на программно инициированное скачивание через blob URL — это ограничение самого механизма object URL, а не что-то специфичное для этого проекта), то есть `filename` из ответа `GET .../files` (список) нужно прокинуть в `downloadMeetingFile`, а не полагаться на заголовок ответа при скачивании.

### 3.4 Типы и функции в `api.ts`

Следуя существующему стилю файла (см. `getMeeting`/`createMeeting` — throw `ApiError` via `buildApiError`, `Bearer` заголовок, явные интерфейсы для payload/response):

```ts
export interface MeetingFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedById: string;
  uploaderEmail: string; // если бэкенд решит включать email аплоадера в ответ, как это уже сделано для participants[].email
  createdAt: string;
}

export async function uploadMeetingFiles(
  accessToken: string,
  meetingId: string,
  files: File[],
): Promise<MeetingFile[]> {
  /* FormData, без Content-Type */
}
export async function getMeetingFiles(
  accessToken: string,
  meetingId: string,
): Promise<MeetingFile[]> {
  /* GET */
}
export async function downloadMeetingFile(
  accessToken: string,
  meetingId: string,
  file: MeetingFile,
): Promise<void> {
  /* blob + object URL, download=file.filename */
}
export async function deleteMeetingFile(
  accessToken: string,
  meetingId: string,
  fileId: string,
): Promise<void> {
  /* DELETE */
}
```

`uploaderEmail` в ответе списка файлов — решение бэкенда (аналог того, как `MeetingParticipant` в ответе `findOne` уже расширяется `email` из связанной `User`, а не отдаётся голым `userId`); стоит сделать так же для `MeetingFile`, чтобы UI не делал доп. запрос за именем/email аплоадера.

---

## Сводка рисков, которые стоит держать в голове при имплементации

1. **`fileFilter` должен возвращать ошибку, а не `false`**, иначе "весь батч отклоняется" не будет выполняться — это единственное место, где неверный выбор API даёт молча иное поведение, чем требует acceptance criteria.
2. Очистка файлов при отказе батча — **встроенная** в multer (`DiskStorage._removeFile`), писать её вручную не нужно; не стоит тратить на это отдельный таск сверх того, что уже в плане.
3. `Content-Disposition` при скачивании нуждается в RFC5987-кодировании из-за недоверенного `filename` — иначе возможна порча заголовка спецсимволами в имени файла.
4. MIME-allowlist по `file.mimetype` — заявленный клиентом тип, не содержимое; это официально принятая граница объёма, а не проверка, которую "забыли" сделать честной.
5. Порядок удаления «БД → диск (best effort)» держит список файлов согласованным даже при сбое unlink; обратный порядок не держит.
