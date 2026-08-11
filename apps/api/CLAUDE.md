# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from `apps/api/` (or via `pnpm --filter api <script>` from the repo root):

```bash
pnpm start           # run compiled app
pnpm dev             # run with watch mode (alias for start:dev, used by root `pnpm dev` via Turborepo)
pnpm start:dev        # run with watch mode (nest start --watch)
pnpm start:debug       # watch mode + --inspect debugger
pnpm build            # nest build
pnpm lint             # eslint --fix over src/apps/libs/test
pnpm format            # prettier --write over src/ and test/
pnpm test             # jest unit tests
pnpm test:watch         # jest --watch
pnpm test:cov           # jest with coverage
pnpm test:e2e           # jest -c test/jest-e2e.json (e2e tests)
```

To run a single unit test file: `pnpm test -- app.controller.spec.ts` (or any jest pattern). To run a single e2e test: `pnpm test:e2e -- auth.e2e-spec.ts`.

All jest scripts run with `NODE_OPTIONS=--experimental-vm-modules` (via `cross-env`) — required because `better-auth` ships ESM-only and is loaded through a dynamic `import()` (see below); without the flag, ts-jest's CommonJS VM context refuses to execute dynamic imports.

## Database

Postgres runs via the repo-root `docker-compose.yml` (`docker compose up -d postgres`, exposed on host port `5544`). Prisma is the ORM:

- `prisma/schema.prisma` — datasource/generator + the `User`, `Session`, `Account`, `Verification`, `Jwks` models required by better-auth (generated with `npx @better-auth/cli generate`, then hand-maintained), plus app-owned `Meeting` (`title`, `date`, `ownerId` → `User`), `MeetingParticipant` (`meetingId` → `Meeting`, `userId` → `User`, `status: ParticipationStatus` — `PENDING`/`ACCEPTED`/`DECLINED`, unique on `(meetingId, userId)`), and `MeetingFile` (`meetingId` → `Meeting` cascade, `uploadedById` → `User` cascade, `filename` — original client-supplied name, untrusted, `storedName` — server-generated UUID, unique, used as the on-disk filename, `mimeType`, `size`, `createdAt`) models. `Meeting.participants` is a relation to `MeetingParticipant`, not a plain string array — inviting a participant requires resolving their email to an existing `User` first.
- `prisma/migrations/` — applied with `npx prisma migrate dev`.
- `.env` (gitignored, see `.env.example`) — `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.
- `src/prisma/prisma.service.ts` — injectable `PrismaService` (extends `PrismaClient`, connects/disconnects with the Nest module lifecycle), provided app-wide by the `@Global()` `PrismaModule`. This is separate from the raw `PrismaClient` instantiated in `better-auth/better-auth.instance.ts` for better-auth's own adapter.

After changing `schema.prisma`, run `npx prisma migrate dev --name <change>` from `apps/api/`.

## Architecture

Standard NestJS application (`@nestjs/cli` scaffold, `nest-cli.json` sets `sourceRoot: src`).

- `src/main.ts` — bootstraps the Nest app (`NestFactory.create(AppModule)`).
- `src/app.module.ts` — root module; registers `AuthModule` and a global `ValidationPipe` (via `APP_PIPE`, so it also applies inside e2e `TestingModule` contexts that don't go through `main.ts`).
- `src/app.controller.ts` / `src/app.service.ts` — the default scaffold controller/service pair.
- `src/better-auth/` — the shared [better-auth](https://www.better-auth.com) integration, used by both `auth/` and `users/` below:
  - `better-auth.instance.ts` — lazily constructs the `betterAuth()` singleton (Prisma adapter + `jwt()` plugin) behind a dynamic `import()`, since better-auth is ESM-only and this project's Jest/ts-jest setup runs as CommonJS. Exposes a small hand-declared `Auth` interface instead of the library's inferred return type, because that inferred type can't be named in emitted `.d.ts` files (`declaration: true` in `tsconfig.json`). Also exports `isBetterAuthApiError`, a type guard for better-auth's `APIError` shape.
- `src/users/` — `UsersModule`: owns user creation and credential lookup, backed by better-auth's `signUpEmail`/`signInEmail`. Exposes its behavior only as `@nestjs/cqrs` commands/queries (registered in `UsersModule`'s providers), not as an injectable service — callers go through `CommandBus`/`QueryBus`, not a direct import of `UsersModule`.
  - `commands/create-user.command.ts` + `create-user.handler.ts` — `CreateUserCommand` (`name`, `email`, `password`) → `CreateUserHandler` calls `signUpEmail`, maps the duplicate-email `APIError` to `ConflictException`, returns the created `AuthUser`.
  - `queries/verify-user-credentials.query.ts` + `verify-user-credentials.handler.ts` — `VerifyUserCredentialsQuery` (`email`, `password`) → `VerifyUserCredentialsHandler` calls `signInEmail`, maps any `APIError` to `UnauthorizedException`, returns the matched `AuthUser`.
- `src/auth/` — JWT issuance and verification:
  - `auth.service.ts` — dispatches `CreateUserCommand`/`VerifyUserCredentialsQuery` (via injected `CommandBus`/`QueryBus`) to `UsersModule`'s handlers, then mints an access token itself via the server-only `auth.api.signJWT` from the shared better-auth instance. This command/query dispatch is the only interaction between `AuthModule` and `UsersModule` — neither module imports the other's providers directly.
  - `auth.controller.ts` — `POST /auth/register` and `POST /auth/login`, both returning `{ accessToken }`.
  - `dto/` — `class-validator` DTOs (`RegisterDto`, `LoginDto`).
  - `jwt-auth.guard.ts` — `JwtAuthGuard`, used via `@UseGuards(JwtAuthGuard)` to protect routes. Verifies the bearer token with `jose` against the public keys in the `Jwks` table (fetched via `PrismaService`, matched by `kid`) and checks `issuer`/`audience` against `BETTER_AUTH_URL`; on success it attaches `{ id, email }` to `request.user`. Exported from `AuthModule` so other modules can import `AuthModule` to use the guard.
  - `current-user.decorator.ts` — `@CurrentUser()` param decorator that reads `request.user` (populated by `JwtAuthGuard`); exports the `AuthenticatedUser` type.
  - Both `AuthModule` and `UsersModule` import `CqrsModule` (from `@nestjs/cqrs`) so their `CommandBus`/`QueryBus` share the same singleton instances; both must be registered in `AppModule` for `UsersModule`'s handlers to be picked up, since `AuthModule` no longer imports `UsersModule` directly.
- `src/prisma/` — `PrismaService` + the `@Global()` `PrismaModule` that provides it app-wide (see Database section above).
- `src/meeting/` — `MeetingModule`: meetings scoped to the authenticated user, imports `AuthModule` to apply `JwtAuthGuard`.
  - `meeting.controller.ts` — `POST /meetings`, `GET /meetings` (meetings the current user owns or is invited to), `GET /meetings/:id` (404 if not found, not owned by, and not inviting the current user), `POST /meetings/:id/accept` and `POST /meetings/:id/decline` (update the current user's own `MeetingParticipant` status; 404 if they have no invitation on that meeting), `POST /meetings/:id/participants` and `DELETE /meetings/:id/participants/:userId` (owner-only invite/remove after creation; 403 if the caller isn't the owner, 404 if the meeting or, for delete, the participant doesn't exist).
  - `meeting.service.ts` — Prisma-backed logic. `create` resolves each `participants` email in the DTO to an existing `User` (throwing `BadRequestException` listing any unmatched emails) and creates a `MeetingParticipant` row per resolved user with status `PENDING`, deduplicating repeated emails first. `findAllForUser`/`findOne` match meetings where the user is the owner OR has a `MeetingParticipant` row, and map each meeting to include a `participants` array (`userId`/`email`/`status`), a `role` (`OWNER`/`PARTICIPANT`), and `myStatus` (the requester's own `ParticipationStatus`, or `null` for an owner). `acceptInvitation`/`declineInvitation` look up the caller's own `MeetingParticipant` row by the `(meetingId, userId)` unique key, update its status, and return the re-fetched meeting via the same mapping — there's no way to act on another user's invitation since the target is always derived from the JWT, never a request parameter. `addParticipants`/`removeParticipant` use a private `getOwnedMeeting` helper (404 if the meeting doesn't exist, `ForbiddenException` if the caller isn't `ownerId`) before resolving/creating or deleting `MeetingParticipant` rows, skipping users who are already participants.
  - `dto/create-meeting.dto.ts` — `CreateMeetingDto` (`title`, `date` as an ISO date string, `participants` as a non-empty array of emails — existence of a matching `User` is checked in the service, not the DTO).
  - `dto/add-participants.dto.ts` — `AddParticipantsDto` (`participants`, same non-empty-array-of-emails validation as `CreateMeetingDto`), used by the owner-only post-creation invite endpoint.
  - `hasAccess(meetingId, userId)` — lightweight `count`-based check for the owner-or-participant rule, reused by `MeetingFileAccessGuard` below (and usable in `findOne` without duplicating the `OR` condition).
- `src/meeting-file/` — file attachments on a meeting; not its own `@Module`, registered directly into `MeetingModule`'s `controllers`/`providers` (per-domain module split wasn't warranted for a controller/service/guard trio this small, and it needs `MeetingService` from the same module for access checks).
  - `meeting-file.controller.ts` — `MeetingFileController`, `@Controller('meetings/:meetingId/files')`, guarded by `JwtAuthGuard` + `MeetingFileAccessGuard`. `POST /` (`FilesInterceptor('files', ...)`, multi-file, `multerOptions` from `upload/multer.config.ts`), `GET /` (list), `GET /:fileId` (streams the file back as a `StreamableFile`, `Content-Type` from the stored `mimeType`, `Content-Disposition` built by `upload/content-disposition.util.ts`'s `buildContentDisposition` — RFC5987-encodes the untrusted original `filename`).
  - `meeting-file.service.ts` — `MeetingFileService`. `saveUploaded` writes one `MeetingFile` row per uploaded file (`storedName` = multer's generated on-disk filename, `filename` = original client name) inside a `$transaction`; throws `BadRequestException` if the files array is empty. `findAllForMeeting` lists a meeting's files ordered by `createdAt`. `getOneForMeeting` looks up a file scoped to its `meetingId` (404 if the file doesn't exist or belongs to a different meeting). All three responses include `uploaderEmail` (joined from `uploadedBy`), mirroring how `MeetingParticipant` responses already expose `email` instead of a bare `userId`.
  - `meeting-file-access.guard.ts` — `MeetingFileAccessGuard`, injects `MeetingService` and calls `hasAccess(meetingId, user.id)`; 404s (not 403) on no access, matching the existing owner-or-participant namespace-hiding pattern used by `MeetingService.findOne`.
  - `upload/multer.config.ts` — `multerOptions` (`diskStorage`, destination `UPLOADS_DIR` = `path.join(process.cwd(), 'uploads')`, filename = `crypto.randomUUID()` with no extension — the on-disk name is never trusted or shown, `Content-Type` on download comes from the DB's `mimeType`) and `limits` (`fileSize`/`files`, hardcoded, no `ConfigService` — see `upload/upload.constants.ts` for the actual numbers and the MIME allowlist). `fileFilter` calls back with a `BadRequestException` (not `cb(null, false)`) for a disallowed MIME type, which is required for "one bad file rejects the whole batch" — silently excluding the file would instead let the rest of the batch through.
  - `upload/content-disposition.util.ts` — `buildContentDisposition`, ASCII-fallback + `filename*=UTF-8''<encoded>` per RFC 5987, since the original filename is unvalidated user input placed into a response header.
  - No custom multer-error exception filter: `@nestjs/platform-express`'s `FilesInterceptor` already converts `MulterError` (size/count limits) into `PayloadTooLargeException`/`BadRequestException` before any app-level exception filter would see it — a `@Catch(MulterError)` filter here would be unreachable dead code.
  - `uploads/` (gitignored, at `apps/api/uploads/` since `UPLOADS_DIR` resolves from `process.cwd()`) — flat directory of uploaded files named by `storedName`, created automatically by multer (`fs.mkdirSync(..., { recursive: true })` when `destination` is a string).
- `test/` — e2e tests, run against a separately built Nest application context (`test/jest-e2e.json` config), distinct from the `*.spec.ts` unit tests colocated in `src/`. `test/auth.e2e-spec.ts`, `test/meeting.e2e-spec.ts`, and `test/meeting-file.e2e-spec.ts` exercise their endpoints end-to-end against the real Postgres database (no mocking) — each test registers a fresh user (random email) to stay isolated.

Unit test config lives in the `jest` key of `package.json` (rootDir `src`, matches `*.spec.ts`); e2e config is the separate `test/jest-e2e.json` file. New features should follow Nest's convention of one module per domain area (`FooModule` with its own controller/service) registered in `imports` of `AppModule`, following the `AuthModule`/`MeetingModule` pattern. Routes that need the authenticated user should import `AuthModule` and use `@UseGuards(JwtAuthGuard)` + `@CurrentUser()`, as `MeetingModule` does — note that because the guard is resolved via Nest's DI when building a `TestingModule` for a protected controller, unit tests for such controllers need `.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })` (see `meeting.controller.spec.ts`).

## File upload

Phase 1 (data model, upload, list, download — see `src/meeting-file/` above) is implemented. Deletion (Phase 2) and the web UI (Phase 3) are still pending — use this research for their implementation: @docs/research-meeting-file-upload-technical-approach.md
