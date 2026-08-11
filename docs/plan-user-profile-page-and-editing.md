# User Profile Page and Editing — Implementation Plan

## Context

The app currently has no way for a logged-in user to manage their own identity: the `User` model already has `name`, `email`, and an unused `image: String?` column, but nothing reads or writes `image`, and there's no UI to change `name` or a password after registration. Per `docs/prd-user-profile-page-and-editing.md`, users need a single `/profile` page (view + inline edit) to change their display name, upload/remove an avatar, and change their password (verifying the current one first) — with the avatar also surfacing in the app header wherever the signed-in user is shown.

The main technical wrinkle, confirmed by inspecting the installed `better-auth@1.6.26` package directly: this app has no better-auth _session_ flow (it mints and verifies its own JWTs via `jose`/a `Jwks` table — see `apps/api/src/auth/jwt-auth.guard.ts`), so better-auth's own `auth.api.updateUser`/`auth.api.changePassword` HTTP endpoints — which require a session cookie/header — cannot be called server-side the way `signJWT`/`signUpEmail`/`signInEmail` currently are. The plan below bypasses those two endpoints and instead uses `better-auth/crypto`'s standalone `hashPassword`/`verifyPassword` functions (no session required) directly against the `Account.password` column, and plain Prisma writes for `User.name`/`User.image` — mirroring exactly what better-auth's own internal `changePassword` implementation does, just invoked directly.

## 1. Backend (apps/api)

### Storage

Reuse the existing shared `uploads/` dir (`UPLOADS_DIR`, exported from `apps/api/src/meeting-file/upload/multer.config.ts`) rather than a new avatar-specific directory — it's already a flat, gitignored, `storedName`-keyed folder with no per-domain subfolder convention. `User.image` stores the avatar's `storedName`, mirroring `MeetingFile.storedName`, with one deliberate deviation: **the filename keeps its extension** (`${randomUUID()}.${ext}`), because unlike `MeetingFile`, `User` has no `mimeType` column — the extension is how `Content-Type` gets reconstructed on download without a migration.

### New files under `apps/api/src/users/`

- `avatar-upload/avatar-upload.constants.ts` — `AVATAR_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024` (5MB); `ALLOWED_AVATAR_MIME_TYPES` = the same 4 image types already used in `meeting-file/upload/upload.constants.ts` (`image/png`, `image/jpeg`, `image/gif`, `image/webp`), duplicated locally to keep `UsersModule` decoupled from `meeting-file`'s internals.
- `avatar-upload/avatar-multer.config.ts` — `avatarMulterOptions`, same `diskStorage`/`fileFilter`/`limits` shape as `meeting-file/upload/multer.config.ts`, importing the shared `UPLOADS_DIR` constant (a plain constant import, not a DI provider, so cross-module use is fine) but with the avatar-specific limit/allowlist and the extension-preserving filename callback described above.
- `dto/update-profile.dto.ts` — `UpdateProfileDto { @IsString() @IsNotEmpty() @MaxLength(100) name: string }`.
- `dto/change-password.dto.ts` — `ChangePasswordDto { @IsString() @IsNotEmpty() currentPassword: string; @IsString() @MinLength(8) newPassword: string; @IsString() @MinLength(8) confirmPassword: string }`. The `newPassword === confirmPassword` check happens in the service (not worth a custom class-validator decorator for one comparison).
- `users.service.ts` — new plain `@Injectable() UsersService` (Prisma + `better-auth/crypto`, no CQRS — nothing here needs cross-module dispatch, matching `MeetingService`'s pattern rather than the CQRS handlers already in this module):
  - `getProfile(userId)` → `{ id, name, email, hasAvatar, avatarVersion }`.
  - `updateProfile(userId, dto)` → `prisma.user.update({ data: { name: dto.name } })`.
  - `uploadAvatar(userId, file)` → reads current `image`, `prisma.user.update({ data: { image: file.filename } })`; if an old image existed, best-effort `unlink` it (`.catch(() => {})` — don't fail the request if it's already gone).
  - `removeAvatar(userId)` → `NotFoundException` if `image` is already `null`; else unlink + null out `image`.
  - `getAvatarFile(userId)` → `NotFoundException` if `image` is `null`; else `{ storedName, mimeType }`, deriving `mimeType` from the extension via the same map used at upload.
  - `changePassword(userId, dto)`: mismatched confirm → `BadRequestException`; look up the `credential` `Account` row (`providerId: 'credential'`) → missing → `UnauthorizedException` (defensive); `verifyPassword({ hash: account.password, password: dto.currentPassword })` false → `UnauthorizedException('Current password is incorrect')`; else `hashPassword(dto.newPassword)` and `prisma.account.update({ data: { password: newHash } })`.
- `users.controller.ts` — `@UseGuards(JwtAuthGuard)`, `@Controller('users/me')`, using `@CurrentUser()` throughout (same pattern as `meeting.controller.ts`):
  - `GET /users/me` → `getProfile`.
  - `PATCH /users/me` (`@Body() dto: UpdateProfileDto`) → `updateProfile`.
  - `POST /users/me/avatar` (`@UseInterceptors(FileInterceptor('avatar', avatarMulterOptions))`) → `uploadAvatar`; no file → `BadRequestException`.
  - `DELETE /users/me/avatar` → `removeAvatar`, 200 no body.
  - `GET /users/me/avatar` → `StreamableFile`, `Content-Type` from `mimeType`; no `Content-Disposition` needed (displayed inline, filename not user-facing).
  - `PATCH /users/me/password` (`@Body() dto: ChangePasswordDto`) → `changePassword`, returns `{ success: true }`.

### `GET /users/me` response shape

```
{ id: string; name: string; email: string; hasAvatar: boolean; avatarVersion: number | null }
```

No raw avatar URL — every request needs a bearer header the frontend attaches itself. `hasAvatar` tells the frontend whether to fetch `GET /users/me/avatar` at all; `avatarVersion` reuses `User.updatedAt` (epoch ms, no new column) so the frontend knows when to refetch the avatar blob after a replace. It also bumps on a name-only edit, which just costs one harmless extra refetch.

### Module wiring

`users.module.ts`: add `imports: [AuthModule]` (new one-directional `UsersModule → AuthModule` dependency — confirmed no cycle: `AuthModule` only imports `CqrsModule`, and `MeetingModule` already does the identical `imports: [AuthModule]` for the same reason), add `UsersController` to `controllers`, `UsersService` to `providers`, alongside the existing `CreateUserHandler`/`VerifyUserCredentialsHandler`. No `AppModule` change needed (`UsersModule` is already registered there).

### Exceptions

| Case                                    | Exception                                       |
| --------------------------------------- | ----------------------------------------------- |
| name empty / too long                   | `BadRequestException` (global `ValidationPipe`) |
| wrong current password                  | `UnauthorizedException`                         |
| new ≠ confirm password                  | `BadRequestException`                           |
| no avatar to remove / GET when none set | `NotFoundException`                             |
| unsupported avatar mime                 | `BadRequestException` (multer `fileFilter`)     |
| oversized avatar                        | `PayloadTooLargeException` (multer limits)      |

## 2. Backend tests

- `apps/api/src/users/users.controller.spec.ts` — mirror `meeting.controller.spec.ts`'s `.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })`; mock `UsersService`; verify each endpoint delegates with correct args and propagates thrown exceptions.
- `apps/api/src/users/users.service.spec.ts` — mock `PrismaService` and `jest.mock('better-auth/crypto')`; cover name update, avatar upload (unlink-old-if-present vs. skip), avatar remove (404 vs. success), password change (mismatch/wrong-current/success paths).
- `apps/api/test/users.e2e-spec.ts` — mirror `test/meeting-file.e2e-spec.ts` (fresh registered user per test, real Postgres): profile GET after registration; name PATCH success + empty/too-long 400s; avatar upload → `hasAvatar: true` + correct `Content-Type` on download; re-upload removes the old file from disk; remove → 404 on second remove; non-image upload → 400; oversized upload → 413; password change wrong-current → 401, mismatch → 400, success → re-login with new password works AND the JWT issued _before_ the change still authenticates `GET /users/me` afterward (proves the current session survives); all endpoints 401 without a bearer token.

## 3. Frontend (apps/web)

- `src/lib/api.ts` additions: `UserProfile` interface; `getMyProfile()`, `updateMyProfile({ name })`, `uploadMyAvatar(file)` (FormData, `formData.append('avatar', file)`, mirrors `uploadMeetingFiles`), `removeMyAvatar()`, `fetchMyAvatarBlobUrl()` (mirrors `downloadMeetingFile`'s blob fetch, returns the object URL instead of triggering a save), `changeMyPassword({ currentPassword, newPassword, confirmPassword })`.
- `src/lib/user-profile-context.tsx` (new) — `UserProfileProvider`/`useUserProfile()`. On mount calls `getMyProfile()`; an effect keyed on `hasAvatar`/`avatarVersion` fetches/refetches the avatar blob URL when `hasAvatar` is true, revoking the previous object URL via a ref before setting a new one and on cleanup/unmount (prevents blob URL leaks). `refresh()` re-fetches the profile (and transitively the avatar, if `avatarVersion` changed) — called by `/profile` after any successful edit so the header updates without a full reload.
- `apps/web/src/app/(app)/layout.tsx` — mount `<UserProfileProvider>` around the authenticated content (after the existing token-check effect settles, so no fetch fires before the redirect-to-`/login` check). In the header, replace the plain `<span>{userEmail}</span>` with a `Link href="/profile"` containing HeroUI's `Avatar` (`Avatar.Root > Avatar.Image src={avatarUrl} + Avatar.Fallback` = initials from `profile?.name`) next to the email, both sourced from `useUserProfile()`. Keep the existing `decodeAccessToken`-based email for the pre-provider redirect check.
- `apps/web/src/app/(app)/profile/page.tsx` (new) — `'use client'`, reads `useUserProfile()`. Four independent sections, each with its own local `isSubmitting`/error state so one never blocks another:
  1. **Avatar** — large `Avatar` display; hidden `<input type="file">` + visible "Change photo" `Button` (same hidden-input trigger pattern as the meeting Files upload); "Remove photo" `Button` (only when `hasAvatar`) behind the existing `AlertDialog` confirmation pattern (same structure as file/participant deletion). Both call `refresh()` on success.
  2. **Name form** — `TextField` prefilled with `profile.name`, HeroUI `Form`/`Alert status="danger"`/submit-disabled-while-pending pattern from `meetings/new/page.tsx`; calls `refresh()` on success.
  3. **Email** — read-only `TextField isDisabled` (or plain labeled text), no submit.
  4. **Password form** — 3 password fields with the `InputGroup` + eye-toggle pattern from `login/page.tsx` (current/new/confirm); client-side `new === confirm` check before submit; success shows an inline confirmation and clears the fields, no forced logout/redirect.

## 4. Documentation

- `apps/api/CLAUDE.md`: add a `src/users/` bullet describing the new `UsersController`/`UsersService` (plain-injectable, alongside the existing CQRS handlers), the new `UsersModule → AuthModule` import, the 5 `/users/me*` endpoints, and the extension-preserving avatar `storedName` deviation from `MeetingFile`'s convention. Update the `User` model description to note what `image` holds once set.
- `apps/web/CLAUDE.md`: add bullets for `src/app/(app)/profile/page.tsx`, `src/lib/user-profile-context.tsx` (including the blob-URL revoke lifecycle), the header/`(app)/layout.tsx` change, and the 6 new `src/lib/api.ts` functions.

## 5. Verification

Backend:

```bash
docker compose up -d postgres   # repo root, required for e2e
cd apps/api
pnpm test -- users.controller.spec.ts users.service.spec.ts
pnpm test:e2e -- users.e2e-spec.ts
pnpm lint
```

Frontend:

```bash
cd apps/web
pnpm lint
pnpm build   # no separate test runner; build catches type errors
```

Manual Playwright MCP pass (required per `apps/web/CLAUDE.md`), using the pre-registered accounts from `apps/web/README.md`:

1. Log in; header shows an initials-fallback avatar linking to `/profile` (no avatar yet).
2. `/profile`: name prefilled, email read-only, initials placeholder, empty password fields.
3. Edit name and submit — no error, field reflects the save, header updates without a reload.
4. Upload a PNG avatar — renders on `/profile` and in the header without a reload.
5. Full page reload — avatar persists (re-fetched from the API).
6. Remove avatar via the confirmation dialog — both `/profile` and header revert to initials.
7. Wrong current password on password change — inline error, no logout.
8. Mismatched new/confirm password — inline validation error before any request fires.
9. Successful password change — success message, stays on `/profile`; log out and back in with the new password in a fresh tab to confirm the change took server-side.
10. Repeat steps 2–4 in dark mode and mobile viewport; run the page through the `ui-ux-pro-max` skill.
11. Upload an oversized or non-image file — error surfaces cleanly without breaking the form.
