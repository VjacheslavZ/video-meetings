import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';

describe('MeetingService', () => {
  let service: MeetingService;
  let prisma: {
    user: {
      findMany: jest.Mock;
    };
    meeting: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
    meetingParticipant: {
      findUnique: jest.Mock;
      update: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const ownerId = 'user-1';
  const participantA = { id: 'user-a', email: 'a@example.com' };
  const participantB = { id: 'user-b', email: 'b@example.com' };

  function participantRow(
    user: { id: string; email: string },
    status: 'PENDING' | 'ACCEPTED' | 'DECLINED' = 'PENDING',
  ) {
    return { userId: user.id, status, user };
  }

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
      },
      meeting: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      meetingParticipant: {
        findUnique: jest.fn(),
        update: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MeetingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<MeetingService>(MeetingService);
  });

  describe('create', () => {
    it('persists a meeting owned by the given user, inviting resolved participant users', async () => {
      const dto: CreateMeetingDto = {
        title: 'Sprint planning',
        date: '2026-08-10T10:00:00.000Z',
        participants: [participantA.email, participantB.email],
      };
      prisma.user.findMany.mockResolvedValue([participantA, participantB]);
      const created = {
        id: 'meeting-1',
        title: dto.title,
        date: dto.date,
        ownerId,
        participants: [
          participantRow(participantA),
          participantRow(participantB),
        ],
      };
      prisma.meeting.create.mockResolvedValue(created);

      const result = await service.create(ownerId, dto);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { email: { in: dto.participants } },
      });
      expect(prisma.meeting.create).toHaveBeenCalledWith({
        data: {
          title: dto.title,
          date: dto.date,
          ownerId,
          participants: {
            create: [{ userId: participantA.id }, { userId: participantB.id }],
          },
        },
        include: { participants: { include: { user: true } } },
      });
      expect(result).toMatchObject({
        id: 'meeting-1',
        role: 'OWNER',
        myStatus: null,
        participants: [
          {
            userId: participantA.id,
            email: participantA.email,
            status: 'PENDING',
          },
          {
            userId: participantB.id,
            email: participantB.email,
            status: 'PENDING',
          },
        ],
      });
    });

    it('rejects when an invited email has no matching registered user', async () => {
      const dto: CreateMeetingDto = {
        title: 'Sprint planning',
        date: '2026-08-10T10:00:00.000Z',
        participants: [participantA.email, 'unknown@example.com'],
      };
      prisma.user.findMany.mockResolvedValue([participantA]);

      await expect(service.create(ownerId, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.meeting.create).not.toHaveBeenCalled();
    });

    it('deduplicates repeated participant emails before resolving and creating', async () => {
      const dto: CreateMeetingDto = {
        title: 'Sprint planning',
        date: '2026-08-10T10:00:00.000Z',
        participants: [participantA.email, participantA.email],
      };
      prisma.user.findMany.mockResolvedValue([participantA]);
      prisma.meeting.create.mockResolvedValue({
        id: 'meeting-1',
        title: dto.title,
        date: dto.date,
        ownerId,
        participants: [participantRow(participantA)],
      });

      await service.create(ownerId, dto);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { email: { in: [participantA.email] } },
      });
      expect(prisma.meeting.create).toHaveBeenCalledWith({
        data: {
          title: dto.title,
          date: dto.date,
          ownerId,
          participants: { create: [{ userId: participantA.id }] },
        },
        include: { participants: { include: { user: true } } },
      });
    });
  });

  describe('findAllForUser', () => {
    it('queries meetings owned by or inviting the user, mapping role and status', async () => {
      const owned = {
        id: 'meeting-1',
        ownerId,
        participants: [participantRow(participantA)],
      };
      const invited = {
        id: 'meeting-2',
        ownerId: participantB.id,
        participants: [
          participantRow({ id: ownerId, email: 'me@example.com' }, 'ACCEPTED'),
        ],
      };
      prisma.meeting.findMany.mockResolvedValue([owned, invited]);

      const result = await service.findAllForUser(ownerId);

      expect(prisma.meeting.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ ownerId }, { participants: { some: { userId: ownerId } } }],
        },
        include: { participants: { include: { user: true } } },
      });
      expect(result[0]).toMatchObject({
        id: 'meeting-1',
        role: 'OWNER',
        myStatus: null,
      });
      expect(result[1]).toMatchObject({
        id: 'meeting-2',
        role: 'PARTICIPANT',
        myStatus: 'ACCEPTED',
      });
    });
  });

  describe('hasAccess', () => {
    it('returns true when the meeting matches the owner-or-participant filter', async () => {
      prisma.meeting.count.mockResolvedValue(1);

      const result = await service.hasAccess('meeting-1', ownerId);

      expect(prisma.meeting.count).toHaveBeenCalledWith({
        where: {
          id: 'meeting-1',
          OR: [{ ownerId }, { participants: { some: { userId: ownerId } } }],
        },
      });
      expect(result).toBe(true);
    });

    it('returns false when no matching meeting is found', async () => {
      prisma.meeting.count.mockResolvedValue(0);

      const result = await service.hasAccess('meeting-1', 'another-user');

      expect(result).toBe(false);
    });
  });

  describe('findOne', () => {
    it('returns the meeting when found and owned by the user', async () => {
      const meeting = { id: 'meeting-1', ownerId, participants: [] };
      prisma.meeting.findFirst.mockResolvedValue(meeting);

      const result = await service.findOne('meeting-1', ownerId);

      expect(prisma.meeting.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'meeting-1',
          OR: [{ ownerId }, { participants: { some: { userId: ownerId } } }],
        },
        include: { participants: { include: { user: true } } },
      });
      expect(result).toMatchObject({ id: 'meeting-1', role: 'OWNER' });
    });

    it('returns the meeting for an invited participant', async () => {
      const meeting = {
        id: 'meeting-1',
        ownerId: 'another-user',
        participants: [
          participantRow({ id: ownerId, email: 'me@example.com' }, 'PENDING'),
        ],
      };
      prisma.meeting.findFirst.mockResolvedValue(meeting);

      const result = await service.findOne('meeting-1', ownerId);

      expect(result).toMatchObject({
        role: 'PARTICIPANT',
        myStatus: 'PENDING',
      });
    });

    it('throws NotFoundException when no matching meeting exists', async () => {
      prisma.meeting.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('missing-id', ownerId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the meeting belongs to another user and the user is not invited', async () => {
      prisma.meeting.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('meeting-1', 'another-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.meeting.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'meeting-1',
          OR: [
            { ownerId: 'another-user' },
            { participants: { some: { userId: 'another-user' } } },
          ],
        },
        include: { participants: { include: { user: true } } },
      });
    });
  });

  describe('acceptInvitation', () => {
    it('updates the current user status to ACCEPTED and returns the mapped meeting', async () => {
      const participant = { id: 'participant-1', status: 'PENDING' };
      prisma.meetingParticipant.findUnique.mockResolvedValue(participant);
      prisma.meetingParticipant.update.mockResolvedValue({
        ...participant,
        status: 'ACCEPTED',
      });
      const meeting = {
        id: 'meeting-1',
        ownerId: 'another-user',
        participants: [
          participantRow({ id: ownerId, email: 'me@example.com' }, 'ACCEPTED'),
        ],
      };
      prisma.meeting.findFirst.mockResolvedValue(meeting);

      const result = await service.acceptInvitation('meeting-1', ownerId);

      expect(prisma.meetingParticipant.findUnique).toHaveBeenCalledWith({
        where: {
          meetingId_userId: { meetingId: 'meeting-1', userId: ownerId },
        },
      });
      expect(prisma.meetingParticipant.update).toHaveBeenCalledWith({
        where: { id: participant.id },
        data: { status: 'ACCEPTED' },
      });
      expect(result).toMatchObject({
        role: 'PARTICIPANT',
        myStatus: 'ACCEPTED',
      });
    });

    it('throws NotFoundException when the user has no invitation on the meeting', async () => {
      prisma.meetingParticipant.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptInvitation('meeting-1', ownerId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.meetingParticipant.update).not.toHaveBeenCalled();
    });
  });

  describe('declineInvitation', () => {
    it('updates the current user status to DECLINED and returns the mapped meeting', async () => {
      const participant = { id: 'participant-1', status: 'PENDING' };
      prisma.meetingParticipant.findUnique.mockResolvedValue(participant);
      prisma.meetingParticipant.update.mockResolvedValue({
        ...participant,
        status: 'DECLINED',
      });
      const meeting = {
        id: 'meeting-1',
        ownerId: 'another-user',
        participants: [
          participantRow({ id: ownerId, email: 'me@example.com' }, 'DECLINED'),
        ],
      };
      prisma.meeting.findFirst.mockResolvedValue(meeting);

      const result = await service.declineInvitation('meeting-1', ownerId);

      expect(prisma.meetingParticipant.update).toHaveBeenCalledWith({
        where: { id: participant.id },
        data: { status: 'DECLINED' },
      });
      expect(result).toMatchObject({
        role: 'PARTICIPANT',
        myStatus: 'DECLINED',
      });
    });

    it('throws NotFoundException when the user has no invitation on the meeting', async () => {
      prisma.meetingParticipant.findUnique.mockResolvedValue(null);

      await expect(
        service.declineInvitation('meeting-1', ownerId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.meetingParticipant.update).not.toHaveBeenCalled();
    });
  });

  describe('addParticipants', () => {
    it('invites resolved users not already on the meeting', async () => {
      const owned = {
        id: 'meeting-1',
        ownerId,
        participants: [participantRow(participantA)],
      };
      prisma.meeting.findUnique.mockResolvedValue(owned);
      prisma.user.findMany.mockResolvedValue([participantA, participantB]);
      prisma.meetingParticipant.createMany.mockResolvedValue({ count: 1 });
      prisma.meeting.findFirst.mockResolvedValue({
        ...owned,
        participants: [
          participantRow(participantA),
          participantRow(participantB),
        ],
      });

      const result = await service.addParticipants('meeting-1', ownerId, [
        participantA.email,
        participantB.email,
      ]);

      expect(prisma.meeting.findUnique).toHaveBeenCalledWith({
        where: { id: 'meeting-1' },
        include: { participants: { include: { user: true } } },
      });
      expect(prisma.meetingParticipant.createMany).toHaveBeenCalledWith({
        data: [{ meetingId: 'meeting-1', userId: participantB.id }],
      });
      expect(result.participants).toHaveLength(2);
    });

    it('does not call createMany when every resolved user is already a participant', async () => {
      const owned = {
        id: 'meeting-1',
        ownerId,
        participants: [participantRow(participantA)],
      };
      prisma.meeting.findUnique.mockResolvedValue(owned);
      prisma.user.findMany.mockResolvedValue([participantA]);
      prisma.meeting.findFirst.mockResolvedValue(owned);

      await service.addParticipants('meeting-1', ownerId, [participantA.email]);

      expect(prisma.meetingParticipant.createMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the meeting does not exist', async () => {
      prisma.meeting.findUnique.mockResolvedValue(null);

      await expect(
        service.addParticipants('missing-id', ownerId, [participantA.email]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the current user is not the meeting owner', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'meeting-1',
        ownerId: 'another-user',
        participants: [],
      });

      await expect(
        service.addParticipants('meeting-1', ownerId, [participantA.email]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('rejects when an invited email has no matching registered user', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'meeting-1',
        ownerId,
        participants: [],
      });
      prisma.user.findMany.mockResolvedValue([]);

      await expect(
        service.addParticipants('meeting-1', ownerId, ['unknown@example.com']),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.meetingParticipant.createMany).not.toHaveBeenCalled();
    });
  });

  describe('removeParticipant', () => {
    it('deletes the participant and returns the updated meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'meeting-1',
        ownerId,
        participants: [participantRow(participantA)],
      });
      prisma.meetingParticipant.deleteMany.mockResolvedValue({ count: 1 });
      prisma.meeting.findFirst.mockResolvedValue({
        id: 'meeting-1',
        ownerId,
        participants: [],
      });

      const result = await service.removeParticipant(
        'meeting-1',
        ownerId,
        participantA.id,
      );

      expect(prisma.meetingParticipant.deleteMany).toHaveBeenCalledWith({
        where: { meetingId: 'meeting-1', userId: participantA.id },
      });
      expect(result.participants).toHaveLength(0);
    });

    it('throws NotFoundException when the participant does not exist', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'meeting-1',
        ownerId,
        participants: [],
      });
      prisma.meetingParticipant.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.removeParticipant('meeting-1', ownerId, participantA.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when the current user is not the meeting owner', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'meeting-1',
        ownerId: 'another-user',
        participants: [],
      });

      await expect(
        service.removeParticipant('meeting-1', ownerId, participantA.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.meetingParticipant.deleteMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the meeting does not exist', async () => {
      prisma.meeting.findUnique.mockResolvedValue(null);

      await expect(
        service.removeParticipant('missing-id', ownerId, participantA.id),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
