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

To run a single unit test file: `pnpm test -- app.controller.spec.ts` (or any jest pattern). To run a single e2e test: `pnpm test:e2e -- app.e2e-spec.ts`.

## Architecture

Standard NestJS application (`@nestjs/cli` scaffold, `nest-cli.json` sets `sourceRoot: src`).

- `src/main.ts` — bootstraps the Nest app (`NestFactory.create(AppModule)`).
- `src/app.module.ts` — root module; register new feature modules here.
- `src/app.controller.ts` / `src/app.service.ts` — the only controller/service pair currently present.
- `test/` — e2e tests, run against a separately built Nest application context (`test/jest-e2e.json` config), distinct from the `*.spec.ts` unit tests colocated in `src/`.

Unit test config lives in the `jest` key of `package.json` (rootDir `src`, matches `*.spec.ts`); e2e config is the separate `test/jest-e2e.json` file. There is no custom module structure beyond the default `AppModule` yet — new features should follow Nest's convention of one module per domain area (`FooModule` with its own controller/service) registered in `imports` of `AppModule`.
