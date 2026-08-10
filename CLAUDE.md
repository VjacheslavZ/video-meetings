# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

This is a pnpm/Turborepo monorepo with two apps:

- `apps/api` — NestJS backend (see `apps/api/CLAUDE.md`). Has a Postgres-backed `AuthModule` (JWT issuance/verification via better-auth, plus the `JwtAuthGuard` that verifies issued JWTs) and `UsersModule` (user creation/credential lookup via better-auth), which interact through `@nestjs/cqrs` commands/queries rather than direct service injection, plus a `MeetingModule` (CRUD-lite for meetings, scoped to the authenticated user); see that file for details.
- `apps/web` — Next.js frontend (see `apps/web/CLAUDE.md`): auth pages (login/register), an authenticated `(app)` route group with a home/meetings dashboard, and a meeting-creation form, all calling `apps/api` via a small `fetch`-based client.

`docker-compose.yml` at the repo root runs Postgres for local development (`docker compose up -d postgres`), used by `apps/api`'s Prisma setup.

## Commands

Run from the repo root (uses Turborepo to fan out to both apps):

```bash
pnpm dev            # run both apps in dev mode
pnpm build          # build both apps
pnpm lint           # lint both apps
pnpm test           # run unit tests in both apps (api only has tests currently)
pnpm test:e2e       # run e2e tests in both apps (requires `docker compose up -d postgres` for api)
pnpm test:all       # run both unit and e2e tests in both apps
pnpm format         # prettier --write across the repo
pnpm format:check   # prettier --check across the repo
```

To target a single app, use pnpm's `--filter`, e.g. `pnpm --filter api test` or `pnpm --filter web dev`, or `cd` into `apps/api` / `apps/web` and use the commands documented in that app's `CLAUDE.md`.

Package manager is pinned via `packageManager: pnpm@11.16.0` in `package.json`; workspace packages are declared in `pnpm-workspace.yaml` (`apps/*`).

## Architecture

- Turborepo (`turbo.json`) defines the task graph: `build` depends on upstream builds (`^build`), `test` depends on `^build`, `lint` depends on `^lint`, and `dev` is a non-cached persistent task.
- There is no shared package between the two apps yet — no `packages/` workspace exists.

## Keeping documentation in sync

Whenever a change alters the project's architecture — new app/package added to the workspace, a shared package introduced, module/folder structure reorganized, new inter-app dependency, or a core framework/tooling swap — update the relevant `CLAUDE.md` (this file and/or `apps/*/CLAUDE.md`) in the same change so it keeps reflecting the actual structure. Do not leave documentation describing a stale architecture.
