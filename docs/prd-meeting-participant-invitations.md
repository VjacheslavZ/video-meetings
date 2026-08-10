# PRD: Meeting Participant Invitations

**Date**: 2026-08-10
**Status**: Draft

## Goal

Let a meeting owner invite other registered users to a meeting, and let invited users see the invitation, and accept or decline it, so meetings have a real multi-user participant list instead of a plain list of email strings.

## User scenarios

- Owner creates a meeting and invites one or more registered users by email -> Each invited user is added as a participant with status "pending".
- Invited user opens their meeting list -> Sees meetings they own and meetings they're invited to, each showing their invitation status (pending/accepted/declined).
- Invited user accepts their invitation -> Their status becomes "accepted"; they keep full access to the meeting.
- Invited user declines their invitation -> Their status becomes "declined"; the meeting is marked declined for them.
- Owner invites an email with no matching registered account -> Request is rejected with a clear validation error; no invitation is created.
- Owner invites a user who is already invited to the same meeting -> Duplicate invitation is rejected (no second row created).
- Owner removes a participant from a meeting -> That user no longer has access to the meeting or sees it in their list.
- A user who is neither the owner nor an invited participant tries to view or act on a meeting -> Request is rejected.
- An invited user tries to accept/decline another user's invitation -> Request is rejected.

## In scope

- New `MeetingParticipant` data model linking `Meeting` and `User`, replacing the current `Meeting.participants: String[]` column, with a status field (`pending` / `accepted` / `declined`).
- API: invite one or more registered users to a meeting by email, at creation time.
- API: invite additional registered users to an existing meeting (owner only).
- API: remove a participant from a meeting (owner only).
- API: accept endpoint and decline endpoint for the invited user's own invitation.
- API: `GET /meetings` for the current user returns meetings they own AND meetings they're invited to, including their invitation status on each.
- API: `GET /meetings/:id` is accessible to the owner and to any invited participant (not owner-only as today), and includes the participant list with statuses.
- Validation: an invite target must resolve to an existing `User` by email; unknown emails are rejected.
- Validation/idempotency: inviting the same user to the same meeting twice does not create a duplicate participant record.
- Authorization: only the meeting owner can invite or remove participants; only an invited user can accept/decline their own invitation.
- Web UI: create-meeting form accepts participant emails and surfaces a validation error for unregistered emails.
- Web UI: meeting list distinguishes owned vs. invited meetings and shows invitation status.
- Web UI: meeting detail page shows accept/decline actions to a pending invitee, and the full participant list with statuses to the owner.

## Out of scope

- Inviting users who don't yet have an account (no invite-to-register-by-email flow).
- Email or push notifications when an invitation is created, accepted, or declined (visibility is via API/UI only).
- Re-inviting a user after they've declined (owner must remove and re-add, which is covered; auto re-invite is not).
- Shareable/public invite links or join-by-link.
- Roles beyond owner vs. participant (e.g., co-host, moderator).
- Any actual video/audio call functionality.
- Editing a meeting's title/date after creation (unless it already exists — not addressed by this feature).

## Technical constraints

- Requires a Prisma schema change: a new `MeetingParticipant` model (`meetingId`, `userId`, `status`) replacing `Meeting.participants: String[]`, plus a migration; existing seeded/test data relying on the old column will need updating.
- `CreateMeetingDto.participants` currently validates as `IsEmail` strings with no existence check; it must be extended so each email is resolved to an existing `User` at request time, rejecting unknown emails.
- `MeetingService.findAllForUser` currently queries only `where: { ownerId }`; must be extended to also include meetings where the requesting user has a `MeetingParticipant` row.
- `MeetingService.findOne` currently 404s unless `ownerId` matches the requester; must be extended to allow access for invited participants, while still rejecting unrelated users.
- New invite/remove/accept/decline endpoints sit behind the existing `JwtAuthGuard` pattern from `MeetingModule`, using `@CurrentUser()` for identity.
- `apps/web` is currently a fresh scaffold with no custom code; this feature requires building the first meeting-related pages/components there (create-meeting form, meeting list, meeting detail).

## Acceptance criteria

- [ ] Owner can create a meeting and invite one or more existing registered users by email; each is added as a participant with status "pending".
- [ ] Inviting an email with no matching registered `User` returns a validation error and no invitation is created.
- [ ] Inviting the same user to the same meeting a second time does not create a duplicate participant record.
- [ ] `GET /meetings` for an invited (non-owner) user includes that meeting along with their invitation status.
- [ ] `GET /meetings` for a user unrelated to a meeting does not include that meeting.
- [ ] `GET /meetings/:id` succeeds for the owner and for any invited participant, and is rejected for unrelated users.
- [ ] An invited user can call an accept endpoint that sets their own status to "accepted".
- [ ] An invited user can call a decline endpoint that sets their own status to "declined".
- [ ] A user cannot accept or decline another user's invitation.
- [ ] Only the meeting owner can invite or remove participants; a non-owner attempting either is rejected.
- [ ] The web create-meeting form lets the owner add participant emails and shows an error when an email isn't a registered user.
- [ ] The web meeting list visually distinguishes owned meetings from invited meetings and displays invitation status.
- [ ] The web meeting detail page shows accept/decline controls to a pending invitee, and the participant list with statuses to the owner.
- [ ] All new/changed endpoints require a valid JWT; unauthenticated requests are rejected.
