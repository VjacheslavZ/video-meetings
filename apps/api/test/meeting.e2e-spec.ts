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

interface MeetingParticipantResponse {
  userId: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
}

interface MeetingResponse {
  id: string;
  title: string;
  date: string;
  ownerId: string;
  role: 'OWNER' | 'PARTICIPANT';
  myStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED' | null;
  participants: MeetingParticipantResponse[];
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

  function meetingBody(participants: string[] = ['placeholder@example.com']) {
    return {
      title: 'Sprint planning',
      date: '2026-08-10T10:00:00.000Z',
      participants,
    };
  }

  describe('POST /meetings', () => {
    it('creates a meeting for the authenticated user, inviting a registered participant as pending', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();

      const response = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);

      const meeting = response.body as MeetingResponse;
      expect(meeting).toMatchObject({
        title: 'Sprint planning',
        role: 'OWNER',
        myStatus: null,
      });
      expect(meeting.participants).toEqual([
        expect.objectContaining({ email: invitee.email, status: 'PENDING' }),
      ]);
      expect(typeof meeting.id).toBe('string');
    });

    it('rejects an invite to an email with no registered user', async () => {
      const owner = await registerUser();

      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody(['unknown@example.com']))
        .expect(400);
    });

    it('does not create duplicate participant rows for a repeated email', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();

      const response = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email, invitee.email]))
        .expect(201);

      const meeting = response.body as MeetingResponse;
      expect(meeting.participants).toHaveLength(1);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .post('/meetings')
        .send(meetingBody())
        .expect(401);
    });

    it.each([
      ['missing title', { ...meetingBody(), title: undefined }],
      ['missing date', { ...meetingBody(), date: undefined }],
      ['invalid date', { ...meetingBody(), date: 'not-a-date' }],
      [
        'participants with an invalid email',
        { ...meetingBody(), participants: ['not-an-email'] },
      ],
    ])('rejects a request with %s', async (_description, body) => {
      const owner = await registerUser();

      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(body)
        .expect(400);
    });
  });

  describe('GET /meetings', () => {
    it("returns meetings the user owns and meetings they're invited to, with status", async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const unrelated = await registerUser();
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);

      const ownerResponse = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const inviteeResponse = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(200);
      const unrelatedResponse = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${unrelated.accessToken}`)
        .expect(200);

      const ownerMeetings = ownerResponse.body as MeetingResponse[];
      const inviteeMeetings = inviteeResponse.body as MeetingResponse[];
      const unrelatedMeetings = unrelatedResponse.body as MeetingResponse[];

      expect(ownerMeetings).toHaveLength(1);
      expect(ownerMeetings[0]).toMatchObject({ role: 'OWNER', myStatus: null });

      expect(inviteeMeetings).toHaveLength(1);
      expect(inviteeMeetings[0]).toMatchObject({
        role: 'PARTICIPANT',
        myStatus: 'PENDING',
      });

      expect(unrelatedMeetings).toHaveLength(0);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer()).get('/meetings').expect(401);
    });
  });

  describe('GET /meetings/:id', () => {
    it('returns the meeting by id for its owner', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      const response = await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({ id, role: 'OWNER' });
    });

    it('returns the meeting by id for an invited participant', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      const response = await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id,
        role: 'PARTICIPANT',
        myStatus: 'PENDING',
      });
    });

    it('returns 404 when the meeting does not exist', async () => {
      const owner = await registerUser();

      await request(app.getHttpServer())
        .get(`/meetings/${randomUUID()}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);
    });

    it('returns 404 when the meeting belongs to another user and they are not invited', async () => {
      const owner = await registerUser();
      const unrelated = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${unrelated.accessToken}`)
        .expect(404);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${randomUUID()}`)
        .expect(401);
    });
  });

  describe('POST /meetings/:id/accept', () => {
    it('sets the invited participant status to ACCEPTED', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      const response = await request(app.getHttpServer())
        .post(`/meetings/${id}/accept`)
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(201);

      expect(response.body).toMatchObject({ id, myStatus: 'ACCEPTED' });

      const getResponse = await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(200);
      expect(getResponse.body).toMatchObject({ myStatus: 'ACCEPTED' });
    });

    it("does not affect another invited participant's status on the same meeting", async () => {
      const owner = await registerUser();
      const inviteeA = await registerUser();
      const inviteeB = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([inviteeA.email, inviteeB.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      await request(app.getHttpServer())
        .post(`/meetings/${id}/accept`)
        .set('Authorization', `Bearer ${inviteeA.accessToken}`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${inviteeB.accessToken}`)
        .expect(200);
      expect(response.body).toMatchObject({ myStatus: 'PENDING' });
    });

    it('rejects when the current user has no invitation on the meeting', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const unrelated = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      await request(app.getHttpServer())
        .post(`/meetings/${id}/accept`)
        .set('Authorization', `Bearer ${unrelated.accessToken}`)
        .expect(404);
    });

    it('rejects when the current user is the meeting owner, not an invitee', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      await request(app.getHttpServer())
        .post(`/meetings/${id}/accept`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${randomUUID()}/accept`)
        .expect(401);
    });
  });

  describe('POST /meetings/:id/decline', () => {
    it('sets the invited participant status to DECLINED', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      const response = await request(app.getHttpServer())
        .post(`/meetings/${id}/decline`)
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(201);

      expect(response.body).toMatchObject({ id, myStatus: 'DECLINED' });
    });

    it('rejects when the current user has no invitation on the meeting', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const unrelated = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      await request(app.getHttpServer())
        .post(`/meetings/${id}/decline`)
        .set('Authorization', `Bearer ${unrelated.accessToken}`)
        .expect(404);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${randomUUID()}/decline`)
        .expect(401);
    });
  });

  describe('POST /meetings/:id/participants', () => {
    it('lets the owner invite an additional registered user as pending', async () => {
      const owner = await registerUser();
      const inviteeA = await registerUser();
      const inviteeB = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([inviteeA.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      const response = await request(app.getHttpServer())
        .post(`/meetings/${id}/participants`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ participants: [inviteeB.email] })
        .expect(201);

      const meeting = response.body as MeetingResponse;
      expect(meeting.participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: inviteeA.email }),
          expect.objectContaining({ email: inviteeB.email, status: 'PENDING' }),
        ]),
      );
      expect(meeting.participants).toHaveLength(2);
    });

    it('does not duplicate a participant who is already invited', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      const response = await request(app.getHttpServer())
        .post(`/meetings/${id}/participants`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ participants: [invitee.email] })
        .expect(201);

      expect((response.body as MeetingResponse).participants).toHaveLength(1);
    });

    it('rejects an invite to an email with no registered user', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      await request(app.getHttpServer())
        .post(`/meetings/${id}/participants`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ participants: ['unknown@example.com'] })
        .expect(400);
    });

    it('rejects when the current user is not the meeting owner', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const outsider = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      await request(app.getHttpServer())
        .post(`/meetings/${id}/participants`)
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .send({ participants: [outsider.email] })
        .expect(403);
    });

    it('returns 404 when the meeting does not exist', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();

      await request(app.getHttpServer())
        .post(`/meetings/${randomUUID()}/participants`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ participants: [invitee.email] })
        .expect(404);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${randomUUID()}/participants`)
        .send({ participants: ['a@example.com'] })
        .expect(401);
    });
  });

  describe('DELETE /meetings/:id/participants/:userId', () => {
    it('lets the owner remove a participant, revoking their access', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id, participants } = createResponse.body as MeetingResponse;
      const inviteeUserId = participants[0].userId;

      const response = await request(app.getHttpServer())
        .delete(`/meetings/${id}/participants/${inviteeUserId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect((response.body as MeetingResponse).participants).toHaveLength(0);

      await request(app.getHttpServer())
        .get(`/meetings/${id}`)
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(404);
    });

    it('returns 404 when the participant does not exist on the meeting', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const notInvited = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id } = createResponse.body as MeetingResponse;

      await request(app.getHttpServer())
        .delete(`/meetings/${id}/participants/${notInvited.email}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);
    });

    it('rejects when the current user is not the meeting owner', async () => {
      const owner = await registerUser();
      const invitee = await registerUser();
      const createResponse = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(meetingBody([invitee.email]))
        .expect(201);
      const { id, participants } = createResponse.body as MeetingResponse;
      const inviteeUserId = participants[0].userId;

      await request(app.getHttpServer())
        .delete(`/meetings/${id}/participants/${inviteeUserId}`)
        .set('Authorization', `Bearer ${invitee.accessToken}`)
        .expect(403);
    });

    it('rejects requests without an access token', async () => {
      await request(app.getHttpServer())
        .delete(`/meetings/${randomUUID()}/participants/${randomUUID()}`)
        .expect(401);
    });
  });
});
