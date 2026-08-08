import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { createLocalJWKSet, jwtVerify, type JWK } from 'jose';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    const payload = await this.verify(token);
    request.user = {
      id: payload.sub as string,
      email: payload.email as string,
    };
    return true;
  }

  private async verify(token: string) {
    const keys = await this.prisma.jwks.findMany();
    if (keys.length === 0) {
      throw new UnauthorizedException('Invalid access token');
    }

    const jwks = createLocalJWKSet({
      keys: keys.map((key) => ({
        ...(JSON.parse(key.publicKey) as JWK),
        kid: key.id,
      })),
    });

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: process.env.BETTER_AUTH_URL,
        audience: process.env.BETTER_AUTH_URL,
      });
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}

function extractBearerToken(header?: string): string | undefined {
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  return header.slice('Bearer '.length);
}
