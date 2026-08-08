import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const VALID_PASSWORD = 'password1234';

interface AccessTokenResponse {
  accessToken: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function registerUser(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test User', email, password });
  }

  describe('POST /auth/register', () => {
    it('registers a new user and returns a JWT access token', async () => {
      const email = uniqueEmail();

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Test User', email, password: VALID_PASSWORD })
        .expect(201);

      const body = response.body as AccessTokenResponse;
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken).toMatch(JWT_REGEX);

      const payload = decodeJwtPayload(body.accessToken);
      expect(payload).toMatchObject({ email });
      expect(payload).toHaveProperty('sub');
    });

    it('rejects registration when the email is already taken', async () => {
      const email = uniqueEmail();

      await registerUser(email, VALID_PASSWORD).expect(201);

      await registerUser(email, VALID_PASSWORD).expect(409);
    });

    it('rejects registration with an invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Test User',
          email: 'not-an-email',
          password: VALID_PASSWORD,
        })
        .expect(400);
    });

    it('rejects registration with a password shorter than 8 characters', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Test User', email: uniqueEmail(), password: 'short' })
        .expect(400);
    });

    it.each([
      ['missing name', { email: uniqueEmail(), password: VALID_PASSWORD }],
      ['missing email', { name: 'Test User', password: VALID_PASSWORD }],
      ['missing password', { name: 'Test User', email: uniqueEmail() }],
    ])('rejects registration with %s', async (_description, body) => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(body)
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with valid credentials and returns a JWT access token', async () => {
      const email = uniqueEmail();
      await registerUser(email, VALID_PASSWORD).expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: VALID_PASSWORD })
        .expect(200);

      const body = response.body as AccessTokenResponse;
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken).toMatch(JWT_REGEX);

      const payload = decodeJwtPayload(body.accessToken);
      expect(payload).toMatchObject({ email });
      expect(payload).toHaveProperty('sub');
    });

    it('rejects login with a wrong password', async () => {
      const email = uniqueEmail();
      await registerUser(email, VALID_PASSWORD).expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    });

    it('rejects login for an email that was never registered', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: uniqueEmail(), password: VALID_PASSWORD })
        .expect(401);
    });

    it('rejects login with an invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email', password: VALID_PASSWORD })
        .expect(400);
    });

    it.each([
      ['missing email', { password: VALID_PASSWORD }],
      ['missing password', { email: uniqueEmail() }],
    ])('rejects login with %s', async (_description, body) => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send(body)
        .expect(400);
    });
  });
});
