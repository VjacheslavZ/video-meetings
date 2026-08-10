import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('register', () => {
    it('delegates to AuthService.register and returns its result', async () => {
      const dto: RegisterDto = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password1234',
      };
      const response = { accessToken: 'signed.jwt.token' };
      authService.register.mockResolvedValue(response);

      const result = await controller.register(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toBe(response);
    });

    it('propagates errors thrown by AuthService.register', async () => {
      const error = new Error('boom');
      authService.register.mockRejectedValue(error);

      await expect(
        controller.register({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password1234',
        }),
      ).rejects.toBe(error);
    });
  });

  describe('login', () => {
    it('delegates to AuthService.login and returns its result', async () => {
      const dto: LoginDto = {
        email: 'test@example.com',
        password: 'password1234',
      };
      const response = { accessToken: 'signed.jwt.token' };
      authService.login.mockResolvedValue(response);

      const result = await controller.login(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toBe(response);
    });

    it('propagates errors thrown by AuthService.login', async () => {
      const error = new Error('boom');
      authService.login.mockRejectedValue(error);

      await expect(
        controller.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toBe(error);
    });
  });
});
