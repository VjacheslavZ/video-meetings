# PRD: Meeting File Upload and Display

**Date**: 2026-08-10
**Status**: Draft

## Goal

Let meeting owners and account-holding participants attach arbitrary files (documents, images, and other materials shared for a meeting) to a meeting, store them for later retrieval, and view/download them from the meeting's page.

## User scenarios

- Meeting owner opens a meeting and uploads one or more files -> Files appear in the meeting's file list, downloadable by anyone with access.
- Authenticated participant of a meeting uploads a file -> File appears in the meeting's file list, attributed to that participant.
- Meeting owner or participant opens a meeting -> Sees the list of files attached to it (name, uploader, upload date, size), and can download any of them.
- File owner deletes their own uploaded file -> File is removed from storage and no longer appears in the meeting's file list.
- Meeting owner deletes any file attached to their meeting (including files uploaded by participants) -> File is removed from storage and no longer appears in the meeting's file list.
- User without access to the meeting attempts to view, upload, or delete a file -> Request is rejected.
- User uploads a file exceeding the size limit or of a disallowed type -> Upload is rejected with a clear error, no partial file is stored.

## In scope

- API endpoint to upload one or more files attached to a specific meeting.
- API endpoint to list files attached to a meeting.
- API endpoint to download/fetch a specific file attached to a meeting.
- API endpoint to delete a file attached to a meeting.
- Storage of uploaded files on the API server's local filesystem.
- Storage of file metadata (original filename, size, MIME type, uploader, meeting, upload timestamp) in Postgres via Prisma.
- Access control: only the meeting owner and participants who have a matching authenticated account may upload, list, download, or delete files for a meeting.
- Deletion permission: a file may be deleted by the user who uploaded it, or by the owner of the meeting it belongs to.
- Default file-type allowlist and a default maximum file size, enforced on upload.
- Web UI on the meeting detail page: an upload control (with progress/error feedback) and a list of attached files showing name, uploader, size, and upload date, with download and delete actions.

## Out of scope

- Recording or uploading the meeting's own audio/video capture.
- Any post-upload processing (transcription, thumbnailing, virus scanning, format conversion, content analysis).
- Object storage (S3/MinIO or similar) — local filesystem only for this iteration.
- File versioning or edit-in-place of an uploaded file.
- Real-time/collaborative file preview or in-browser rendering of file contents.
- Notifications (email/push) when a file is added to or removed from a meeting.
- Per-file granular sharing/permissions beyond "meeting owner + participants with an account."

## Technical constraints

- `Meeting.participants` is currently stored as a plain array of email strings with no link to `User` records. Granting upload/view/delete access to "participants with an account" requires resolving a participant's email to a `User` record at request time (e.g., matching the authenticated user's email against the `participants` array); this does not require a schema change to `Meeting` itself but must be implemented in the authorization check.
- Files are stored on the API server's local disk. This does not scale across multiple server instances/replicas without a shared volume — acceptable for this iteration per explicit decision, but any future move to multi-instance deployment will require migrating to shared/object storage.
- Uploaded file metadata needs a new Prisma model (e.g., `MeetingFile`) linked to `Meeting` and to the uploading `User`, requiring a new migration.
- Endpoints must sit behind `JwtAuthGuard` (existing pattern from `MeetingModule`), with an additional authorization check scoping access to the meeting's owner or its participants.
- Default max file size and allowed MIME types must be enforced server-side (not just in the UI), since the API is a separate deployable from the web app.

## Acceptance criteria

- [ ] An authenticated meeting owner can upload a file to their meeting via the API and see it returned in the meeting's file list.
- [ ] An authenticated user whose email matches one of the meeting's `participants` can upload a file to that meeting.
- [ ] An authenticated user who is neither the owner nor a matching participant receives an authorization error when attempting to upload, list, download, or delete files for that meeting.
- [ ] Uploading a file above the default size limit is rejected with an error and no file/metadata is persisted.
- [ ] Uploading a file with a disallowed MIME type is rejected with an error and no file/metadata is persisted.
- [ ] `GET` list endpoint returns all files for a meeting with filename, uploader, size, MIME type, and upload timestamp.
- [ ] A file can be downloaded via the API and the returned bytes match what was uploaded.
- [ ] The file's uploader can delete their own file; after deletion it no longer appears in the list and the underlying file is removed from disk.
- [ ] The meeting owner can delete any file attached to their meeting, including files uploaded by participants.
- [ ] A user who is neither the file's uploader nor the meeting owner cannot delete the file.
- [ ] The meeting detail page in the web app shows an upload control and the current list of attached files with download and delete actions, reflecting the API's access-control rules.
- [ ] Uploading, listing, downloading, and deleting files all require a valid JWT; unauthenticated requests are rejected.
