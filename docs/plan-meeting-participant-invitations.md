# Plan: Meeting Participant Invitations

**PRD:** docs/prd-meeting-participant-invitations.md
**Date:** 2026-08-10

## Implementation phases

### Phase 1: Invite-by-email data model + create/list/get end-to-end

**Goal:** Replace the plain `participants: String[]` column with a real `MeetingParticipant` model, and make meeting creation, listing, and fetch-by-id work end-to-end against it (registered-user-only invites, pending status, visible to invitees).
**Affects:** backend, database
**Tasks:**

- [x] Add `MeetingParticipant` Prisma model (`meetingId`, `userId`, `status: PENDING | ACCEPTED | DECLINED`, unique on `(meetingId, userId)`), drop `Meeting.participants`, and generate the migration.
- [x] Update `CreateMeetingDto`/`MeetingService.create` to resolve each invited email to an existing `User` and create a `MeetingParticipant` row with status `PENDING`; reject the request with a validation error if any email has no matching `User`; skip/ignore exact duplicate invites within the same request.
- [x] Update `MeetingService.findAllForUser` to return meetings the user owns OR has a `MeetingParticipant` row for, including that user's status on each returned meeting.
- [x] Update `MeetingService.findOne` to allow access for the owner or any invited participant (not owner-only), returning the participant list with statuses, and still rejecting unrelated users.
- [x] Update/extend `meeting.service.spec.ts`, `meeting.controller.spec.ts`, and `test/meeting.e2e-spec.ts` to cover: invite-by-email success, unknown-email rejection, duplicate-invite no-op, invited user seeing the meeting in `GET /meetings`, and `GET /meetings/:id` access for owner vs. invited vs. unrelated users.

**Done when:** A meeting created with valid participant emails persists `MeetingParticipant` rows with status `PENDING`; `GET /meetings` and `GET /meetings/:id` reflect ownership and invitation correctly for owner, invitee, and unrelated users; all new/updated tests pass. ✅ Done.

### Phase 2: Accept / decline invitation

**Goal:** Let an invited user respond to their own invitation.
**Affects:** backend
**Tasks:**

- [x] Add `POST /meetings/:id/accept` and `POST /meetings/:id/decline` endpoints behind `JwtAuthGuard`, updating the `MeetingParticipant` status for the current user only.
- [x] Reject accept/decline attempts from a user with no `MeetingParticipant` row on that meeting (404/403), and reject attempts to act on another user's invitation.
- [x] Unit tests for the accept/decline service logic and controller (including the rejection cases).
- [x] E2E tests: an invited user accepts and their status becomes `ACCEPTED`; a different invited user declines and their status becomes `DECLINED`; a user cannot alter another user's invitation status.

**Done when:** An invited user can flip their own status between `PENDING`/`ACCEPTED`/`DECLINED` via the API, and cannot affect any other user's invitation. ✅ Done.

### Phase 3: Owner-managed invites after creation

**Goal:** Let the meeting owner invite or remove participants on an existing meeting, not just at creation time.
**Affects:** backend
**Tasks:**

- [ ] Add `POST /meetings/:id/participants` (owner-only, same email-resolution/validation/dedupe rules as Phase 1's create-time invite) to add a new `PENDING` participant to an existing meeting.
- [ ] Add `DELETE /meetings/:id/participants/:userId` (owner-only) to remove a participant, after which that user loses access via `findOne`/`findAllForUser`.
- [ ] Enforce that only the meeting's owner can call either endpoint; a non-owner (including an accepted participant) gets rejected.
- [ ] Unit + e2e tests: owner adds a participant post-creation; owner removes a participant and the removed user no longer sees or can access the meeting; non-owner invite/remove attempts are rejected.

**Done when:** The owner can fully manage a meeting's participant list after creation, and no non-owner can invite or remove participants.

### Phase 4: Web — create meeting and meeting list

**Goal:** Build the first meeting UI in `apps/web`: a create-meeting form with participant invites, and a meeting list that distinguishes owned vs. invited meetings with status.
**Affects:** frontend
**Tasks:**

- [ ] Build a create-meeting form (title, date, participant emails) that calls the Phase 1 create endpoint and surfaces the unknown-email validation error inline.
- [ ] Build a meeting list view consuming `GET /meetings`, visually separating "meetings I own" from "meetings I'm invited to," and showing each invitation's status for invited meetings.
- [ ] Wire both views into the authenticated app shell (using the existing JWT-based session) so only a logged-in user can reach them.
- [ ] Component/integration tests for the form's validation-error display and the list's owned/invited grouping.

**Done when:** A logged-in user can create a meeting with invitees through the UI and see their full meeting list (owned + invited, with status) rendered correctly.

### Phase 5: Web — meeting detail: accept/decline and participant management

**Goal:** Build the meeting detail page: accept/decline controls for a pending invitee, and the participant list (with statuses) plus add/remove controls for the owner.
**Affects:** frontend
**Tasks:**

- [ ] Build the meeting detail page showing the participant list with statuses (visible to the owner) and calling the Phase 1 `findOne` data.
- [ ] Add accept/decline buttons shown only to a pending invitee, wired to the Phase 2 endpoints, updating the displayed status on success.
- [ ] Add owner-only controls to invite an additional participant and remove an existing one, wired to the Phase 3 endpoints.
- [ ] Component/integration tests: pending invitee sees and can use accept/decline; owner sees and can use add/remove; a non-owner never sees owner-only controls.

**Done when:** From the meeting detail page, an invitee can accept/decline their invitation and the owner can fully manage participants, matching the API's authorization rules.
