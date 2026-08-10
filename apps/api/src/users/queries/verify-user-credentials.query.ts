export class VerifyUserCredentialsQuery {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {}
}
