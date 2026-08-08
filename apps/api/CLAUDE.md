# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from `apps/api/` (or via `pnpm --filter api <script>` from the repo root):

```bash
pnpm start           # run compiled app
pnpm start:dev        # run with watch mode (nest start --watch)
pnpm start:debug       # watch mode + --inspect debugger
pnpm build            # nest build
pnpm lint             # eslint --fix over src/apps/libs/test
pnpm format            # prettier --write over src/ and test/
pnpm test             # jest unit tests
pnpm test:watch         # jest --watch
pnpm test:cov           # jest with coverage
pnpm test:e2e           # jest -c test/jest-e2e.json (e2e tests)
```

To run a single unit test file: `pnpm test -- app.controller.spec.ts` (or any jest pattern). To run a single e2e test: `pnpm test:e2e -- auth.e2e-spec.ts`.

All jest scripts run with `NODE_OPTIONS=--experimental-vm-modules` (via `cross-env`) — required because `better-auth` ships ESM-only and is loaded through a dynamic `import()` (see below); without the flag, ts-jest's CommonJS VM context refuses to execute dynamic imports.

## Database

Postgres runs via the repo-root `docker-compose.yml` (`docker compose up -d postgres`, exposed on host port `5544`). Prisma is the ORM:

- `prisma/schema.prisma` — datasource/generator + the `User`, `Session`, `Account`, `Verification`, `Jwks` models required by better-auth (generated with `npx @better-auth/cli generate`, then hand-maintained).
- `prisma/migrations/` — applied with `npx prisma migrate dev`.
- `.env` (gitignored, see `.env.example`) — `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.

After changing `schema.prisma`, run `npx prisma migrate dev --name <change>` from `apps/api/`.

## Architecture

Standard NestJS application (`@nestjs/cli` scaffold, `nest-cli.json` sets `sourceRoot: src`).

- `src/main.ts` — bootstraps the Nest app (`NestFactory.create(AppModule)`).
- `src/app.module.ts` — root module; registers `AuthModule` and a global `ValidationPipe` (via `APP_PIPE`, so it also applies inside e2e `TestingModule` contexts that don't go through `main.ts`).
- `src/app.controller.ts` / `src/app.service.ts` — the default scaffold controller/service pair.
- `src/auth/` — email/password authentication, backed by [better-auth](https://www.better-auth.com):
  - `auth.instance.ts` — lazily constructs the `betterAuth()` singleton (Prisma adapter + `jwt()` plugin) behind a dynamic `import()`, since better-auth is ESM-only and this project's Jest/ts-jest setup runs as CommonJS. Exposes a small hand-declared `Auth` interface instead of the library's inferred return type, because that inferred type can't be named in emitted `.d.ts` files (`declaration: true` in `tsconfig.json`).
  - `auth.service.ts` — calls `auth.api.signUpEmail` / `signInEmail`, then mints an access token via the server-only `auth.api.signJWT`. Maps better-auth's `APIError` statuses to `ConflictException` (duplicate email) / `UnauthorizedException` (bad credentials).
  - `auth.controller.ts` — `POST /auth/register` and `POST /auth/login`, both returning `{ accessToken }`.
  - `dto/` — `class-validator` DTOs (`RegisterDto`, `LoginDto`).
- `test/` — e2e tests, run against a separately built Nest application context (`test/jest-e2e.json` config), distinct from the `*.spec.ts` unit tests colocated in `src/`. `test/auth.e2e-spec.ts` exercises the auth endpoints end-to-end against the real Postgres database (no mocking) — each test uses a random email to stay isolated.

Unit test config lives in the `jest` key of `package.json` (rootDir `src`, matches `*.spec.ts`); e2e config is the separate `test/jest-e2e.json` file. New features should follow Nest's convention of one module per domain area (`FooModule` with its own controller/service) registered in `imports` of `AppModule`, following the `AuthModule` pattern.
