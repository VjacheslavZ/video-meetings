import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthUser, getAuth } from '../better-auth/better-auth.instance';
import { CreateUserCommand } from '../users/commands/create-user.command';
import { VerifyUserCredentialsQuery } from '../users/queries/verify-user-credentials.query';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface AccessTokenResponse {
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async register({
    name,
    email,
    password,
  }: RegisterDto): Promise<AccessTokenResponse> {
    const user = await this.commandBus.execute<CreateUserCommand, AuthUser>(
      new CreateUserCommand(name, email, password),
    );
    return { accessToken: await this.issueJwt(user) };
  }

  async login({ email, password }: LoginDto): Promise<AccessTokenResponse> {
    const user = await this.queryBus.execute<
      VerifyUserCredentialsQuery,
      AuthUser
    >(new VerifyUserCredentialsQuery(email, password));
    return { accessToken: await this.issueJwt(user) };
  }

  private async issueJwt(user: AuthUser): Promise<string> {
    const auth = await getAuth();
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
