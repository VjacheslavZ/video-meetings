import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const VALID_PASSWORD = 'password1234';

interface AccessTokenResponse {
  accessToken: string;
}

interface MeetingResponse {
  id: string;
  title: string;
  date: string;
  participants: string[];
}

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

describe('Meetings (e2e)', () => {
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

  async function registerUser(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Test User',
        email: uniqueEmail(),
        password: VALID_PASSWORD,
      })
      .expect(201);
    return (response.body as AccessTokenResponse).accessToken;
  }

  function validMeetingBody() {
    return {
      title: 'Sprint planning',
      date: '2026-08-10T10:00:00.000Z',
      participants: ['a@example.com', 'b@example.com'],
    };
  }

  describe('POST /meetings', () => {
    it('creates a meeting for the authenticated user', async () => {
      const accessToken = await registerUser();
      const body = validMeetingBody();

      const response = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)
        .expect(201);

      const meeting = response.body as MeetingResponse;
      expect(meeting).toMatchObject(body);
      expect(typeof meeting.id).toBe('string');
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .send(validMeetingBody())
        .expect(401);
    });

    it.each([
      ['missing title', { ...validMeetingBody(), title: undefined }],
      ['missing date', { ...validMeetingBody(), date: undefined }],
      ['invalid date', { ...validMeetingBody(), date: 'not-a-date' }],
      [
        'participants with an invalid email',
        { ...validMeetingBody(), participants: ['not-an-email'] },
      ],
    ])('rejects a request with %s', async (_description, body) => {
      const accessToken = await registerUser();

      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body)
        .expect(400);
    });
  });

  describe('GET /meetings', () => {
    it("returns only the current user's meetings", async () => {
      const ownerToken = await registerUser();
      const otherToken = await registerUser();
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(validMeetingBody())
        .expect(201);

      const ownerResponse = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      const otherResponse = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      const ownerMeetings = ownerResponse.body as MeetingResponse[];
      const otherMeetings = otherResponse.body as MeetingResponse[];
      expect(ownerMeetings).toHaveLength(1);
      expect(ownerMeetings[0]).toMatchObject(validMeetingBody());
      expect(otherMeetings).toHaveLength(0);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer()).get('/meetings').expect(401);
    });
  });

  describe('GET /meetings/:id', () => {
    it('returns the meeting by id for its owner', async () => {
      const accessToken = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validMeetingBody())
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      const response = await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ id, ...validMeetingBody() });
    });

    it('returns 404 when the meeting does not exist', async () => {
      const accessToken = await registerUser();

      await request(app.getHttpServer())
        .get(`/meetings/${randomUUID()}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns 404 when the meeting belongs to another user', async () => {
      const ownerToken = await registerUser();
      const otherToken = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(validMeetingBody())
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${randomUUID()}`)
        .expect(401);
    });
  });
});
