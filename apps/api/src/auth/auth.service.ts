import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Auth, AuthUser, getAuth } from './auth.instance';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface AccessTokenResponse {
  accessToken: string;
}

interface BetterAuthApiError {
  status: string;
}

function isBetterAuthApiError(error: unknown): error is BetterAuthApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'string'
  );
}

@Injectable()
export class AuthService {
  async register({
    name,
    email,
    password,
  }: RegisterDto): Promise<AccessTokenResponse> {
    const auth = await getAuth();
    try {
      const { user } = await auth.api.signUpEmail({
        body: { name, email, password },
      });
      return { accessToken: await this.issueJwt(auth, user) };
    } catch (error) {
      if (
        isBetterAuthApiError(error) &&
        error.status === 'UNPROCESSABLE_ENTITY'
      ) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }

  async login({ email, password }: LoginDto): Promise<AccessTokenResponse> {
    const auth = await getAuth();
    try {
      const { user } = await auth.api.signInEmail({
        body: { email, password },
      });
      return { accessToken: await this.issueJwt(auth, user) };
    } catch (error) {
      if (isBetterAuthApiError(error)) {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw error;
    }
  }

  private async issueJwt(auth: Auth, user: AuthUser): Promise<string> {
    const { token } = await auth.api.signJWT({
      body: {
        payload: {
          ...user,
          sub: user.id,
          iat: Math.floor(Date.now() / 1000),
        },
      },
    });
    if (!token) {
      throw new Error(
        'better-auth did not return a JWT; is the jwt plugin enabled?',
      );
    }
    return token;
  }
}
