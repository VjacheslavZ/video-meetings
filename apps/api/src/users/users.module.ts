import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CreateUserHandler } from './commands/create-user.handler';
import { VerifyUserCredentialsHandler } from './queries/verify-user-credentials.handler';

@Module({
  imports: [CqrsModule],
  providers: [CreateUserHandler, VerifyUserCredentialsHandler],
})
export class UsersModule {}
