import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthService } from './auth.service';
import { getAuth } from '../better-auth/better-auth.instance';
import { CreateUserCommand } from '../users/commands/create-user.command';
import { VerifyUserCredentialsQuery } from '../users/queries/verify-user-credentials.query';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

jest.mock('../better-auth/better-auth.instance', () => ({
  getAuth: jest.fn(),
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;

describe('AuthService', () => {
  let service: AuthService;
  let commandBus: { execute: jest.Mock };
  let queryBus: { execute: jest.Mock };
  let signJWT: jest.Mock;

  beforeEach(() => {
    commandBus = { execute: jest.fn() };
    queryBus = { execute: jest.fn() };
    service = new AuthService(
      commandBus as unknown as CommandBus,
      queryBus as unknown as QueryBus,
    );
    signJWT = jest.fn();

    mockedGetAuth.mockResolvedValue({
      api: {
        signUpEmail: jest.fn(),
        signInEmail: jest.fn(),
        signJWT,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const dto: RegisterDto = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'password1234',
    };
    const user = { id: 'user-1', email: dto.email, name: dto.name };

    it('dispatches CreateUserCommand and returns a minted access token', async () => {
      commandBus.execute.mockResolvedValue(user);
      signJWT.mockResolvedValue({ token: 'signed.jwt.token' });

      const result = await service.register(dto);

      expect(commandBus.execute).toHaveBeenCalledWith(
        new CreateUserCommand(dto.name, dto.email, dto.password),
      );
      expect(signJWT).toHaveBeenCalledTimes(1);
      const [{ body }] = signJWT.mock.calls[0] as [
        { body: { payload: Record<string, unknown> } },
      ];
      expect(body.payload).toMatchObject({
        id: user.id,
        email: user.email,
        name: user.name,
        sub: user.id,
      });
      expect(typeof body.payload.iat).toBe('number');
      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });

    it('propagates errors from CreateUserCommand', async () => {
      const error = new Error('boom');
      commandBus.execute.mockRejectedValue(error);

      await expect(service.register(dto)).rejects.toBe(error);
      expect(signJWT).not.toHaveBeenCalled();
    });

    it('throws when better-auth returns no JWT', async () => {
      commandBus.execute.mockResolvedValue(user);
      signJWT.mockResolvedValue({ token: null });

      await expect(service.register(dto)).rejects.toThrow(
        'better-auth did not return a JWT; is the jwt plugin enabled?',
      );
    });
  });

  describe('login', () => {
    const dto: LoginDto = {
      email: 'test@example.com',
      password: 'password1234',
    };
    const user = { id: 'user-1', email: dto.email, name: 'Test User' };

    it('dispatches VerifyUserCredentialsQuery and returns a minted access token', async () => {
      queryBus.execute.mockResolvedValue(user);
      signJWT.mockResolvedValue({ token: 'signed.jwt.token' });

      const result = await service.login(dto);

      expect(queryBus.execute).toHaveBeenCalledWith(
        new VerifyUserCredentialsQuery(dto.email, dto.password),
      );
      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });

    it('propagates errors from VerifyUserCredentialsQuery', async () => {
      const error = new Error('boom');
      queryBus.execute.mockRejectedValue(error);

      await expect(service.login(dto)).rejects.toBe(error);
      expect(signJWT).not.toHaveBeenCalled();
    });
  });
});
