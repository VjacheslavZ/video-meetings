# Plan: Meeting File Upload and Display

**PRD:** docs/prd-meeting-file-upload-and-display.md
**Date:** 2026-08-10

## Note on the PRD's technical constraints

The PRD's "Technical constraints" section describes `Meeting.participants` as a plain array of email strings with no link to `User` records, requiring email-matching for access control. That's stale — the participant-invitations feature (already shipped) replaced it with a real `MeetingParticipant` model (`userId → User`, `status: PENDING | ACCEPTED | DECLINED`). This plan uses that model directly via the existing access rule already used by `MeetingService` (`owner OR any participant, regardless of status`); no email-matching workaround is needed.

## Implementation phases

### Phase 1: File data model + upload + list + download (backend)

**Goal:** A meeting owner or participant can upload one or more files to a meeting via the API, list them, and download the exact bytes back. Files are rejected server-side if they exceed the size limit or aren't an allowed type, with nothing persisted on rejection.
**Affects:** backend, database
**Tasks:**

- [ ] Add a `MeetingFile` Prisma model (`meetingId → Meeting` cascade delete, `uploadedById → User` cascade delete, `filename`, `storedName`, `mimeType`, `size`, `createdAt`) plus back-relations on `Meeting`/`User`; hand-write and apply the migration; add an `uploads/` entry to the root `.gitignore`.
- [ ] Add `multer` + `@types/multer` as direct dependencies of `apps/api`; build multer disk-storage config with a hardcoded max file size, max files per request, and a MIME-type allowlist, plus a filename-sanitizing helper and an exception filter mapping multer's size/count errors to proper 4xx responses.
- [ ] Add a `MeetingFileAccessGuard` reusing the existing owner-or-participant access rule, applied to all file routes; wire `POST /meetings/:meetingId/files` (multi-file upload) and `GET /meetings/:meetingId/files` (list) through a new `MeetingFileController`/`MeetingFileService`, registered in `MeetingModule`.
- [ ] Add `GET /meetings/:meetingId/files/:fileId` streaming the file back with correct `Content-Type`/`Content-Disposition` headers.
- [ ] Unit tests (service, controller, access guard) and e2e tests: owner and participant uploads succeed and appear in the list; an unrelated user gets 404 on upload/list/download; an oversized or disallowed-type file is rejected with nothing persisted; a mixed batch (one valid, one invalid) rejects the whole batch; downloaded bytes match the upload; all routes reject unauthenticated requests.

**Done when:** A file uploaded through the API is listed with correct metadata and downloads byte-identical; invalid uploads are cleanly rejected; access is scoped to the meeting's owner/participants.

### Phase 2: File deletion (backend)

**Goal:** The file's uploader or the meeting owner can delete a file, removing it from both the database and disk.
**Affects:** backend
**Tasks:**

- [ ] Add `DELETE /meetings/:meetingId/files/:fileId`: allowed for the file's uploader or the meeting's owner (403 for any other participant), unlinks the on-disk file and removes the database row; 404 if the file doesn't belong to the given meeting.
- [ ] Unit + e2e tests: uploader deletes their own file; owner deletes a participant's file; a non-owner/non-uploader participant gets 403; a wrong `meetingId` gets 404; unauthenticated requests get 401.
- [ ] Manual curl verification of the full lifecycle (upload → list → download → delete) against a running dev server.

**Done when:** Deletion follows the PRD's permission rules exactly, and a deleted file is gone from both the list and disk.

### Phase 3: Web — files section on the meeting detail page

**Goal:** From the meeting detail page, an owner or participant can upload files, see the current file list, download any file, and delete files they're allowed to delete.
**Affects:** frontend
**Tasks:**

- [ ] Add `MeetingFile` type and `uploadMeetingFiles`/`getMeetingFiles`/`deleteMeetingFile`/`downloadMeetingFile` functions to `apps/web/src/lib/api.ts` (multipart upload via `FormData`; download fetched as a blob and saved via a temporary object URL, since the endpoint requires an `Authorization` header a plain link can't send).
- [ ] Add a "Files" section to `apps/web/src/app/(app)/meetings/[id]/page.tsx`: a multi-file upload control with a busy/error state, and a list showing filename, uploader, size, and upload date.
- [ ] Wire the download action, and a delete action (owner or uploader only) behind the same `AlertDialog` confirmation pattern already used for removing a participant on this page.
- [ ] Add any missing icons (upload/download) to `apps/web/src/components/icons.tsx` following the existing inline-SVG style.
- [ ] Verify end-to-end via Playwright MCP (no test runner configured in `apps/web`, per its `CLAUDE.md`): upload, list, download, delete as uploader and as owner, error states (oversized/disallowed file), light/dark theme, mobile viewport; run the change through the `ui-ux-pro-max` skill.

**Done when:** A logged-in user can upload, view, download, and (where permitted) delete meeting files entirely through the UI, matching the API's access-control rules.
