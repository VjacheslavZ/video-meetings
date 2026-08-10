import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AuthUser,
  getAuth,
  isBetterAuthApiError,
} from '../../better-auth/better-auth.instance';
import { CreateUserCommand } from './create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute({
    name,
    email,
    password,
  }: CreateUserCommand): Promise<AuthUser> {
    const auth = await getAuth();
    try {
      const { user } = await auth.api.signUpEmail({
        body: { name, email, password },
      });
      return user;
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
}
