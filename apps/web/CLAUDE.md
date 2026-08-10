# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Run from `apps/web/` (or via `pnpm --filter web <script>` from the repo root):

```bash
pnpm dev      # next dev
pnpm build    # next build
pnpm start    # next start (serve production build)
pnpm lint     # eslint
```

There is no test runner configured for this app yet.

## Architecture

Next.js App Router project (`create-next-app` scaffold, Next 16, React 19), using HeroUI v3 (`@heroui/react`) + Tailwind v4 for UI.

- `src/app/layout.tsx` — root layout; `src/app/globals.css` — global styles, including light/dark theme tokens (HeroUI's dark theme is opt-in via a `.dark` class/`data-theme` attribute, not `prefers-color-scheme`).
- `src/app/login/page.tsx`, `src/app/register/page.tsx` — unauthenticated auth pages; on success they store the JWT via `setAccessToken` (`lib/auth.ts`) and redirect to `/`.
- `src/app/(app)/layout.tsx` — layout for authenticated routes: redirects to `/login` if no valid access token is found client-side, renders the header (logo, signed-in email, log out) otherwise.
- `src/app/(app)/page.tsx` — home page (`/`), shows the 3 most recently created meetings.
- `src/app/(app)/meetings/page.tsx` — full meeting list, split into Upcoming/Past sections.
- `src/app/(app)/meetings/new/page.tsx` — create-meeting form (title, date & time, comma-separated participant emails); participant emails must belong to registered users, and the API's validation error (e.g. an unknown email) is surfaced inline.
- `src/app/(app)/meetings/[id]/page.tsx` — meeting detail page: date, role/status badge; Accept/Decline buttons for a pending invitee; a participant list with per-row status; owner-only controls to invite more participants (inline form) and remove one (icon button behind a HeroUI `AlertDialog` confirmation, since removal is immediate and access-affecting). A user with no access gets a 404-style message rather than raw API errors.
- `src/components/meeting-list.tsx` — shared list renderer used by both meeting pages; each row links to `/meetings/[id]` and shows an "Owner" chip for meetings the current user owns, or a status chip (Pending/Accepted/Declined) for meetings they're invited to.
- `src/lib/api.ts` — `fetch`-based client for `apps/api` (register/login/get meetings/create meeting/get meeting by id/accept/decline/add participants/remove participant), throwing `ApiError` (with `status`) on non-2xx responses.
- `src/lib/auth.ts` — access-token storage (`localStorage`) and a non-verifying JWT payload decode used only for display (e.g. showing the signed-in email).
- `public/` — static assets served from `/`.

New routes follow the App Router convention of `src/app/<segment>/page.tsx`; authenticated routes go under `src/app/(app)/`.

**Read `@AGENTS.md` above before writing any code** — this Next.js version has breaking changes vs. training data; consult `node_modules/next/dist/docs/` for current API/conventions rather than relying on prior knowledge.

## Testing changes before calling them done

- **Any UI change** (new component, styling, layout, copy, interaction state): before reporting the work as complete, visually test it with the Playwright MCP tools (`mcp__playwright__*`) — navigate to the affected page, take a screenshot, and exercise the changed states (hover/focus, error/empty/loading states, light and dark color scheme, mobile viewport). Also run the change through the `ui-ux-pro-max` skill to check it against its UX/accessibility guidelines. Do not claim a UI change works based on reading the code alone.
- **Any new functionality** (not just UI — new flows, forms, API calls wired into the frontend): also drive it end-to-end with the Playwright MCP tools to confirm it actually works in the browser, not just that it type-checks or lints.
