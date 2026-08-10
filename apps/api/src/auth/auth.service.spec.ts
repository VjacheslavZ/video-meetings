import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { getAuth } from './auth.instance';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

jest.mock('./auth.instance', () => ({
  getAuth: jest.fn(),
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;

describe('AuthService', () => {
  let service: AuthService;
  let signUpEmail: jest.Mock;
  let signInEmail: jest.Mock;
  let signJWT: jest.Mock;

  beforeEach(() => {
    service = new AuthService();
    signUpEmail = jest.fn();
    signInEmail = jest.fn();
    signJWT = jest.fn();

    mockedGetAuth.mockResolvedValue({
      api: { signUpEmail, signInEmail, signJWT },
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

    it('signs up the user and returns a minted access token', async () => {
      signUpEmail.mockResolvedValue({ user });
      signJWT.mockResolvedValue({ token: 'signed.jwt.token' });

      const result = await service.register(dto);

      expect(signUpEmail).toHaveBeenCalledWith({
        body: { name: dto.name, email: dto.email, password: dto.password },
      });
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

    it('throws ConflictException when the email is already taken', async () => {
      signUpEmail.mockRejectedValue({ status: 'UNPROCESSABLE_ENTITY' });

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(signJWT).not.toHaveBeenCalled();
    });

    it('rethrows better-auth errors that are not the duplicate-email case', async () => {
      signUpEmail.mockRejectedValue({ status: 'BAD_REQUEST' });

      await expect(service.register(dto)).rejects.toMatchObject({
        status: 'BAD_REQUEST',
      });
    });

    it('rethrows errors that are not shaped like a better-auth API error', async () => {
      const unexpected = new Error('boom');
      signUpEmail.mockRejectedValue(unexpected);

      await expect(service.register(dto)).rejects.toBe(unexpected);
    });

    it('throws when better-auth returns no JWT', async () => {
      signUpEmail.mockResolvedValue({ user });
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

    it('signs in the user and returns a minted access token', async () => {
      signInEmail.mockResolvedValue({ user });
      signJWT.mockResolvedValue({ token: 'signed.jwt.token' });

      const result = await service.login(dto);

      expect(signInEmail).toHaveBeenCalledWith({
        body: { email: dto.email, password: dto.password },
      });
      expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    });

    it('throws UnauthorizedException on any better-auth API error', async () => {
      signInEmail.mockRejectedValue({ status: 'UNAUTHORIZED' });

      await expect(service.login(dto)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(signJWT).not.toHaveBeenCalled();
    });

    it('rethrows errors that are not shaped like a better-auth API error', async () => {
      const unexpected = new Error('boom');
      signInEmail.mockRejectedValue(unexpected);

      await expect(service.login(dto)).rejects.toBe(unexpected);
    });
  });
});
