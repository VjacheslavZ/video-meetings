# PRD: User Profile Page and Editing

**Date**: 2026-08-11
**Status**: Draft

## Goal

Authenticated users need a single place to view and manage their own identity — display name, avatar, and password — so they can personalize their account and keep their credentials current without contacting support.

## User scenarios

- User navigates to their profile page -> Sees their current name, email (read-only), and avatar (or default initials/placeholder if none set).
- User edits their display name and saves -> Name updates immediately and is reflected on the profile page and in the header wherever the logged-in user is shown.
- User uploads a new avatar image -> Avatar updates on the profile page and in the header once the upload succeeds.
- User removes their existing avatar -> Avatar reverts to a default placeholder (e.g. initials) on the profile page and header.
- User changes their password, entering their current password plus a new password (with confirmation) -> Password is updated; user stays logged in on the current session.
- User enters an incorrect current password when attempting a password change -> Change is rejected with an inline error; new password is not applied.
- User uploads an avatar that is too large or an unsupported file type -> Upload is rejected with an inline error; existing avatar is unchanged.

## In scope

- A single authenticated `/profile` page combining view and inline editing (no separate `/profile/edit` route).
- Display of current name, email (read-only), and avatar (or default placeholder) on page load.
- Edit display name (validated non-empty, reasonable max length).
- Upload a new avatar image (replaces any existing one).
- Remove the current avatar, reverting to a default placeholder (e.g. initials derived from name).
- Change password: requires current password, new password, and new password confirmation; current password is verified before the change is applied.
- Avatar shown in the app header/nav alongside (or replacing) the signed-in user indicator (`src/app/(app)/layout.tsx`), reflecting updates made on the profile page without requiring a full page reload of every route (re-fetch or shared state on save is acceptable).
- Server-side validation for all three actions (name, avatar, password), with inline error surfacing on the client, consistent with existing form patterns in the app (e.g. meeting creation, participant invites).
- Avatar file constraints reusing the app's existing image-upload conventions (image MIME types only, size limit).

## Out of scope

- Changing email address.
- Deleting or deactivating the account.
- Two-factor authentication or session/device management.
- Editing any other user's profile (admin functionality).
- Avatar cropping/editing tools (upload is used as-is).
- Password reset via email ("forgot password") flow — this PRD only covers changing a known password while logged in.

## Technical constraints

- The `User` model already has an `image: String?` field (better-auth convention) — reusable for avatar storage; no schema change needed for the avatar itself.
- Password changes go through better-auth's credential storage (`Account.password`), not a field the app can update directly via Prisma — must use better-auth's server API for verifying the current password and setting a new one.
- The current `Auth` interface in `apps/api/src/better-auth/better-auth.instance.ts` only exposes `signUpEmail`/`signInEmail`/`signJWT`; it will need extending to expose whatever better-auth API supports profile update and password change.
- Avatar storage should follow the existing `meeting-file` upload pattern (`multer`, disk storage, server-generated filename) rather than introducing a new upload mechanism, including reuse of the existing image MIME allowlist subset (`image/png`, `image/jpeg`, `image/gif`, `image/webp`).
- The header in `apps/web/src/app/(app)/layout.tsx` currently renders the signed-in user's email as text only; it needs to render the avatar (or placeholder) as well, and must pick up profile changes made on `/profile` without a hard page reload.
- `src/lib/auth.ts`'s non-verifying JWT decode is currently used for display (email) in the header — profile data (name, avatar) needed for the header will require a fetch from the API rather than reading it out of the JWT.

## Acceptance criteria

- [ ] `/profile` is only reachable when authenticated (unauthenticated users are redirected to `/login`, matching other `(app)` routes).
- [ ] Profile page displays current name, read-only email, and avatar (or default placeholder when no avatar is set).
- [ ] Submitting a new, valid name updates the user's name and is reflected on `/profile` and in the header without a full page reload.
- [ ] Submitting an empty or excessively long name is rejected with an inline validation error and no change is persisted.
- [ ] Uploading a supported image file (allowed MIME type, within size limit) as avatar replaces the existing avatar and is reflected on `/profile` and in the header.
- [ ] Uploading a disallowed file type or an oversized file is rejected with an inline error; the previous avatar is unchanged.
- [ ] Removing the avatar clears it and both `/profile` and the header fall back to the default placeholder.
- [ ] Submitting a password change with the correct current password and a valid new password (matching confirmation) succeeds, and the user remains logged in on the current session.
- [ ] Submitting a password change with an incorrect current password is rejected with an inline error; the password is not changed.
- [ ] Submitting a password change where new password and confirmation don't match is rejected client-side (or server-side) before any change is applied.
- [ ] All three actions (name, avatar, password) can be performed independently without requiring the others to be filled in.
