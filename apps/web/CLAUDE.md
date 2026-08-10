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

Next.js App Router project (`create-next-app` scaffold, Next 16, React 19).

- `src/app/layout.tsx` — root layout.
- `src/app/page.tsx` — home page (`/`).
- `src/app/globals.css` / `page.module.css` — global and page-scoped styles (CSS Modules).
- `public/` — static assets served from `/`.

No routing beyond the root page exists yet; new routes follow the App Router convention of `src/app/<segment>/page.tsx`.

**Read `@AGENTS.md` above before writing any code** — this Next.js version has breaking changes vs. training data; consult `node_modules/next/dist/docs/` for current API/conventions rather than relying on prior knowledge.

## Testing changes before calling them done

- **Any UI change** (new component, styling, layout, copy, interaction state): before reporting the work as complete, visually test it with the Playwright MCP tools (`mcp__playwright__*`) — navigate to the affected page, take a screenshot, and exercise the changed states (hover/focus, error/empty/loading states, light and dark color scheme, mobile viewport). Also run the change through the `ui-ux-pro-max` skill to check it against its UX/accessibility guidelines. Do not claim a UI change works based on reading the code alone.
- **Any new functionality** (not just UI — new flows, forms, API calls wired into the frontend): also drive it end-to-end with the Playwright MCP tools to confirm it actually works in the browser, not just that it type-checks or lints.
