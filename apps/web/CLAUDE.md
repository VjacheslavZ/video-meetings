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
