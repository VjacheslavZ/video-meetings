import { UnauthorizedException } from '@nestjs/common';
import { VerifyUserCredentialsHandler } from './verify-user-credentials.handler';
import { VerifyUserCredentialsQuery } from './verify-user-credentials.query';
import { getAuth } from '../../better-auth/better-auth.instance';

jest.mock('../../better-auth/better-auth.instance', () => ({
  getAuth: jest.fn(),
  isBetterAuthApiError: jest.requireActual<
    typeof import('../../better-auth/better-auth.instance')
  >('../../better-auth/better-auth.instance').isBetterAuthApiError,
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;

describe('VerifyUserCredentialsHandler', () => {
  let handler: VerifyUserCredentialsHandler;
  let signInEmail: jest.Mock;

  beforeEach(() => {
    handler = new VerifyUserCredentialsHandler();
    signInEmail = jest.fn();
    mockedGetAuth.mockResolvedValue({
      api: { signUpEmail: jest.fn(), signInEmail, signJWT: jest.fn() },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const query = new VerifyUserCredentialsQuery(
    'test@example.com',
    'password1234',
  );
  const user = { id: 'user-1', email: query.email, name: 'Test User' };

  it('verifies the credentials and returns the user', async () => {
    signInEmail.mockResolvedValue({ user });

    const result = await handler.execute(query);

    expect(signInEmail).toHaveBeenCalledWith({
      body: { email: query.email, password: query.password },
    });
    expect(result).toEqual(user);
  });

  it('throws UnauthorizedException on any better-auth API error', async () => {
    signInEmail.mockRejectedValue({ status: 'UNAUTHORIZED' });

    await expect(handler.execute(query)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rethrows errors that are not shaped like a better-auth API error', async () => {
    const unexpected = new Error('boom');
    signInEmail.mockRejectedValue(unexpected);

    await expect(handler.execute(query)).rejects.toBe(unexpected);
  });
});
