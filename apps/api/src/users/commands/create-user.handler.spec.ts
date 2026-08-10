import { ConflictException } from '@nestjs/common';
import { CreateUserHandler } from './create-user.handler';
import { CreateUserCommand } from './create-user.command';
import { getAuth } from '../../better-auth/better-auth.instance';

jest.mock('../../better-auth/better-auth.instance', () => ({
  getAuth: jest.fn(),
  isBetterAuthApiError: jest.requireActual<
    typeof import('../../better-auth/better-auth.instance')
  >('../../better-auth/better-auth.instance').isBetterAuthApiError,
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;

describe('CreateUserHandler', () => {
  let handler: CreateUserHandler;
  let signUpEmail: jest.Mock;

  beforeEach(() => {
    handler = new CreateUserHandler();
    signUpEmail = jest.fn();
    mockedGetAuth.mockResolvedValue({
      api: { signUpEmail, signInEmail: jest.fn(), signJWT: jest.fn() },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const command = new CreateUserCommand(
    'Test User',
    'test@example.com',
    'password1234',
  );
  const user = {
    id: 'user-1',
    email: command.email,
    name: command.name,
  };

  it('signs up the user and returns it', async () => {
    signUpEmail.mockResolvedValue({ user });

    const result = await handler.execute(command);

    expect(signUpEmail).toHaveBeenCalledWith({
      body: {
        name: command.name,
        email: command.email,
        password: command.password,
      },
    });
    expect(result).toEqual(user);
  });

  it('throws ConflictException when the email is already taken', async () => {
    signUpEmail.mockRejectedValue({ status: 'UNPROCESSABLE_ENTITY' });

    await expect(handler.execute(command)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rethrows better-auth errors that are not the duplicate-email case', async () => {
    signUpEmail.mockRejectedValue({ status: 'BAD_REQUEST' });

    await expect(handler.execute(command)).rejects.toMatchObject({
      status: 'BAD_REQUEST',
    });
  });

  it('rethrows errors that are not shaped like a better-auth API error', async () => {
    const unexpected = new Error('boom');
    signUpEmail.mockRejectedValue(unexpected);

    await expect(handler.execute(command)).rejects.toBe(unexpected);
  });
});
