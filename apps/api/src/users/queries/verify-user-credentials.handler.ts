import { UnauthorizedException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  AuthUser,
  getAuth,
  isBetterAuthApiError,
} from '../../better-auth/better-auth.instance';
import { VerifyUserCredentialsQuery } from './verify-user-credentials.query';

@QueryHandler(VerifyUserCredentialsQuery)
export class VerifyUserCredentialsHandler implements IQueryHandler<VerifyUserCredentialsQuery> {
  async execute({
    email,
    password,
  }: VerifyUserCredentialsQuery): Promise<AuthUser> {
    const auth = await getAuth();
    try {
      const { user } = await auth.api.signInEmail({
        body: { email, password },
      });
      return user;
    } catch (error) {
      if (isBetterAuthApiError(error)) {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw error;
    }
  }
}
