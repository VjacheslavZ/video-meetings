import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const ISSUER = 'https://auth.example.com';
const KID = 'test-key-1';

async function createSignedToken(overrides: {
  privateKey: CryptoKey;
  sub?: string;
  email?: string;
  issuer?: string;
  audience?: string;
  alg?: string;
}): Promise<string> {
  return new SignJWT({
    sub: overrides.sub ?? 'user-1',
    email: overrides.email ?? 'user@example.com',
  })
    .setProtectedHeader({ alg: overrides.alg ?? 'RS256', kid: KID })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? ISSUER)
    .setExpirationTime('1h')
    .sign(overrides.privateKey);
}

function createContext(request: {
  headers: Record<string, string | undefined>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const originalIssuer = process.env.BETTER_AUTH_URL;

  let publicKey: CryptoKey;
  let privateKey: CryptoKey;
  let jwk: JWK;
  let prisma: { jwks: { findMany: jest.Mock } };
  let guard: JwtAuthGuard;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256');
    publicKey = keyPair.publicKey;
    privateKey = keyPair.privateKey;
    jwk = await exportJWK(publicKey);
  });

  beforeEach(() => {
    process.env.BETTER_AUTH_URL = ISSUER;
    prisma = { jwks: { findMany: jest.fn() } };
    guard = new JwtAuthGuard(prisma as unknown as PrismaService);
  });

  afterAll(() => {
    process.env.BETTER_AUTH_URL = originalIssuer;
  });

  it('attaches the decoded user and allows the request through for a valid token', async () => {
    prisma.jwks.findMany.mockResolvedValue([
      { id: KID, publicKey: JSON.stringify(jwk) },
    ]);
    const token = await createSignedToken({
      privateKey,
      sub: 'user-42',
      email: 'user42@example.com',
    });
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: `Bearer ${token}` },
    };

    const allowed = await guard.canActivate(createContext(request));

    expect(allowed).toBe(true);
    expect(request.user).toEqual({
      id: 'user-42',
      email: 'user42@example.com',
    });
  });

  it('throws when the Authorization header is missing', async () => {
    const request = { headers: {} };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.jwks.findMany).not.toHaveBeenCalled();
  });

  it('throws when the Authorization header is not a Bearer token', async () => {
    const request = { headers: { authorization: 'Basic abc123' } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when there are no JWKS keys in the database', async () => {
    prisma.jwks.findMany.mockResolvedValue([]);
    const token = await createSignedToken({ privateKey });
    const request = { headers: { authorization: `Bearer ${token}` } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when the token was signed with an unknown key', async () => {
    const otherKeyPair = await generateKeyPair('RS256');
    prisma.jwks.findMany.mockResolvedValue([
      { id: KID, publicKey: JSON.stringify(jwk) },
    ]);
    const token = await createSignedToken({
      privateKey: otherKeyPair.privateKey,
    });
    const request = { headers: { authorization: `Bearer ${token}` } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when the issuer does not match BETTER_AUTH_URL', async () => {
    prisma.jwks.findMany.mockResolvedValue([
      { id: KID, publicKey: JSON.stringify(jwk) },
    ]);
    const token = await createSignedToken({
      privateKey,
      issuer: 'https://malicious.example.com',
    });
    const request = { headers: { authorization: `Bearer ${token}` } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when the audience does not match BETTER_AUTH_URL', async () => {
    prisma.jwks.findMany.mockResolvedValue([
      { id: KID, publicKey: JSON.stringify(jwk) },
    ]);
    const token = await createSignedToken({
      privateKey,
      audience: 'https://someone-else.example.com',
    });
    const request = { headers: { authorization: `Bearer ${token}` } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when the token is malformed', async () => {
    prisma.jwks.findMany.mockResolvedValue([
      { id: KID, publicKey: JSON.stringify(jwk) },
    ]);
    const request = { headers: { authorization: 'Bearer not-a-real-token' } };

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
