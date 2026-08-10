import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  [key: string]: unknown;
}

interface SignEmailResult {
  user: AuthUser;
}

export interface Auth {
  api: {
    signUpEmail(args: {
      body: { name: string; email: string; password: string };
    }): Promise<SignEmailResult>;
    signInEmail(args: {
      body: { email: string; password: string };
    }): Promise<SignEmailResult>;
    signJWT(args: {
      body: { payload: Record<string, unknown> };
    }): Promise<{ token: string | null }>;
  };
}

async function createAuth(): Promise<Auth> {
  const [{ betterAuth }, { prismaAdapter }, { jwt }] = await Promise.all([
    import('better-auth'),
    import('better-auth/adapters/prisma'),
    import('better-auth/plugins'),
  ]);

  const auth = betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
    },
    plugins: [jwt()],
  });

  // better-auth's builder-inferred type can't be named in emitted .d.ts
  // files (it references a deeply nested zod subpath); Auth above is a
  // hand-declared subset covering only what callers actually invoke.
  return auth;
}

let authPromise: Promise<Auth> | undefined;

// better-auth ships ESM-only; a dynamic import lets Node's loader resolve it
// natively instead of requiring Jest/ts-jest to transform its .mjs output.
export function getAuth(): Promise<Auth> {
  authPromise ??= createAuth();
  return authPromise;
}

export interface BetterAuthApiError {
  status: string;
}

export function isBetterAuthApiError(
  error: unknown,
): error is BetterAuthApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'string'
  );
}
