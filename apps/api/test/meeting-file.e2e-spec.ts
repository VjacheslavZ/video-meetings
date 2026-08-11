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

interface RegisteredUser {
  accessToken: string;
  email: string;
}

interface MeetingResponse {
  id: string;
}

interface MeetingFileResponse {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedById: string;
  uploaderEmail: string;
  createdAt: string;
}

function uniqueEmail(): string {
  return `test-${randomUUID()}@example.com`;
}

describe('Meeting files (e2e)', () => {
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

  async function registerUser(): Promise<RegisteredUser> {
    const email = uniqueEmail();
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Test User',
        email,
        password: VALID_PASSWORD,
      })
      .expect(201);
    return {
      accessToken: (response.body as AccessTokenResponse).accessToken,
      email,
    };
  }

  async function createMeeting(
    owner: RegisteredUser,
    participantEmails?: string[],
  ): Promise<string> {
    const emails = participantEmails ?? [(await registerUser()).email];
    const response = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        title: 'Sprint planning',
        date: '2026-08-10T10:00:00.000Z',
        participants: emails,
      })
      .expect(201);
    return (response.body as MeetingResponse).id;
  }

  describe('POST /meetings/:meetingId/files', () => {
    it('lets the meeting owner upload a file, appearing in the list', async () => {
      const owner = await registerUser();
      const meetingId = await createMeeting(owner);

      const response = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .attach('files', Buffer.from('hello world'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      const uploaded = response.body as MeetingFileResponse[];
      expect(uploaded).toHaveLength(1);
      expect(uploaded[0]).toMatchObject({
        filename: 'notes.txt',
        mimeType: 'text/plain',
        size: 11,
        uploaderEmail: owner.email,
      });
      expect(typeof uploaded[0].uploadedById).toBe('string');

      const listResponse = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(listResponse.body).toEqual(uploaded);
    });

    it('lets an invited participant upload a file, attributed to them', async () => {
      const owner = await registerUser();
      const participant = await registerUser();
      const meetingId = await createMeeting(owner, [participant.email]);

      const response = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${participant.accessToken}`)
        .attach('files', Buffer.from('participant file'), {
          filename: 'agenda.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      const uploaded = response.body as MeetingFileResponse[];
      expect(uploaded[0]).toMatchObject({
        filename: 'agenda.txt',
        uploaderEmail: participant.email,
      });

      const listResponse = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(listResponse.body).toHaveLength(1);
    });

    it('accepts multiple files in one request, all appearing in the list', async () => {
      const owner = await registerUser();
      const meetingId = await createMeeting(owner);

      const response = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .attach('files', Buffer.from('file one'), {
          filename: 'one.txt',
          contentType: 'text/plain',
        })
        .attach('files', Buffer.from('file two'), {
          filename: 'two.txt',
          contentType: 'text/plain',
        })
        .expect(201);

      expect(response.body as MeetingFileResponse[]).toHaveLength(2);
    });

    it('rejects an oversized file, persisting nothing', async () => {
      const owner = await registerUser();
      const meetingId = await createMeeting(owner);
      const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 1);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .attach('files', oversized, {
          filename: 'huge.pdf',
          contentType: 'application/pdf',
        })
        .expect(413);

      const listResponse = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(listResponse.body).toEqual([]);
    });

    it('rejects a disallowed MIME type, persisting nothing', async () => {
      const owner = await registerUser();
      const meetingId = await createMeeting(owner);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .attach('files', Buffer.from('#!/bin/sh\necho hi'), {
          filename: 'script.sh',
          contentType: 'application/x-sh',
        })
        .expect(400);

      const listResponse = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(listResponse.body).toEqual([]);
    });

    it('rejects the whole batch when one file in it is disallowed', async () => {
      const owner = await registerUser();
      const meetingId = await createMeeting(owner);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .attach('files', Buffer.from('valid file'), {
          filename: 'valid.txt',
          contentType: 'text/plain',
        })
        .attach('files', Buffer.from('#!/bin/sh\necho hi'), {
          filename: 'script.sh',
          contentType: 'application/x-sh',
        })
        .expect(400);

      const listResponse = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(listResponse.body).toEqual([]);
    });

    it('returns 404 for a user who is neither owner nor participant', async () => {
      const owner = await registerUser();
      const unrelated = await registerUser();
      const meetingId = await createMeeting(owner);

      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${unrelated.accessToken}`)
        .attach('files', Buffer.from('hello'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(404);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${randomUUID()}/files`)
        .attach('files', Buffer.from('hello'), {
          filename: 'notes.txt',
          contentType: 'text/plain',
        })
        .expect(401);
    });
  });

  describe('GET /meetings/:meetingId/files', () => {
    it('returns 404 for a user who is neither owner nor participant', async () => {
      const owner = await registerUser();
      const unrelated = await registerUser();
      const meetingId = await createMeeting(owner);

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${unrelated.accessToken}`)
        .expect(404);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${randomUUID()}/files`)
        .expect(401);
    });
  });

  describe('GET /meetings/:meetingId/files/:fileId', () => {
    async function uploadFile(
      owner: RegisteredUser,
      meetingId: string,
      content: Buffer,
      filename = 'notes.txt',
    ): Promise<string> {
      const response = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .attach('files', content, {
          filename,
          contentType: 'text/plain',
        })
        .expect(201);
      return (response.body as MeetingFileResponse[])[0].id;
    }

    it('downloads bytes identical to what was uploaded', async () => {
      const owner = await registerUser();
      const meetingId = await createMeeting(owner);
      const content = Buffer.from('the exact bytes to round-trip');
      const fileId = await uploadFile(owner, meetingId, content);

      const response = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(response.text).toBe(content.toString('utf8'));
    });

    it('returns 404 for a user who is neither owner nor participant', async () => {
      const owner = await registerUser();
      const unrelated = await registerUser();
      const meetingId = await createMeeting(owner);
      const fileId = await uploadFile(owner, meetingId, Buffer.from('hi'));

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${unrelated.accessToken}`)
        .expect(404);
    });

    it('returns 404 for a file id that does not belong to the meeting', async () => {
      const owner = await registerUser();
      const meetingId = await createMeeting(owner);

      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${randomUUID()}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${randomUUID()}/files/${randomUUID()}`)
        .expect(401);
    });
  });

  describe('DELETE /meetings/:meetingId/files/:fileId', () => {
    async function uploadFile(
      uploader: RegisteredUser,
      meetingId: string,
      filename = 'notes.txt',
    ): Promise<string> {
      const response = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${uploader.accessToken}`)
        .attach('files', Buffer.from('some bytes'), {
          filename,
          contentType: 'text/plain',
        })
        .expect(201);
      return (response.body as MeetingFileResponse[])[0].id;
    }

    it('lets the uploader delete their own file, removing it from the list', async () => {
      const owner = await registerUser();
      const meetingId = await createMeeting(owner);
      const fileId = await uploadFile(owner, meetingId);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      const listResponse = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(listResponse.body).toEqual([]);
    });

    it("lets the meeting owner delete a participant's file", async () => {
      const owner = await registerUser();
      const participant = await registerUser();
      const meetingId = await createMeeting(owner, [participant.email]);
      const fileId = await uploadFile(participant, meetingId);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      const listResponse = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(listResponse.body).toEqual([]);
    });

    it('returns 403 for a participant who is neither the uploader nor the owner', async () => {
      const owner = await registerUser();
      const uploaderParticipant = await registerUser();
      const otherParticipant = await registerUser();
      const meetingId = await createMeeting(owner, [
        uploaderParticipant.email,
        otherParticipant.email,
      ]);
      const fileId = await uploadFile(uploaderParticipant, meetingId);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${otherParticipant.accessToken}`)
        .expect(403);

      const listResponse = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(listResponse.body).toHaveLength(1);
    });

    it('returns 404 for a user who is neither owner nor participant', async () => {
      const owner = await registerUser();
      const unrelated = await registerUser();
      const meetingId = await createMeeting(owner);
      const fileId = await uploadFile(owner, meetingId);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${fileId}`)
        .set('Authorization', `Bearer ${unrelated.accessToken}`)
        .expect(404);
    });

    it('returns 404 for a file id that does not belong to the meeting', async () => {
      const owner = await registerUser();
      const meetingId = await createMeeting(owner);

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${randomUUID()}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .delete(`/meetings/${randomUUID()}/files/${randomUUID()}`)
        .expect(401);
    });
  });
});
