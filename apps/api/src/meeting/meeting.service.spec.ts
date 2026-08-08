import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';

describe('MeetingService', () => {
  let service: MeetingService;
  let prisma: {
    meeting: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  const ownerId = 'user-1';

  beforeEach(async () => {
    prisma = {
      meeting: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MeetingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<MeetingService>(MeetingService);
  });

  describe('create', () => {
    it('persists a meeting owned by the given user', async () => {
      const dto: CreateMeetingDto = {
        title: 'Sprint planning',
        date: '2026-08-10T10:00:00.000Z',
        participants: ['a@example.com', 'b@example.com'],
      };
      const created = { id: 'meeting-1', ownerId, ...dto };
      prisma.meeting.create.mockResolvedValue(created);

      const result = await service.create(ownerId, dto);

      expect(prisma.meeting.create).toHaveBeenCalledWith({
        data: {
          title: dto.title,
          date: dto.date,
          participants: dto.participants,
          ownerId,
        },
      });
      expect(result).toBe(created);
    });
  });

  describe('findAllForUser', () => {
    it("queries meetings scoped to the user's ownerId", async () => {
      const meetings = [{ id: 'meeting-1', ownerId }];
      prisma.meeting.findMany.mockResolvedValue(meetings);

      const result = await service.findAllForUser(ownerId);

      expect(prisma.meeting.findMany).toHaveBeenCalledWith({
        where: { ownerId },
      });
      expect(result).toBe(meetings);
    });
  });

  describe('findOne', () => {
    it('returns the meeting when found and owned by the user', async () => {
      const meeting = { id: 'meeting-1', ownerId };
      prisma.meeting.findFirst.mockResolvedValue(meeting);

      const result = await service.findOne('meeting-1', ownerId);

      expect(prisma.meeting.findFirst).toHaveBeenCalledWith({
        where: { id: 'meeting-1', ownerId },
      });
      expect(result).toBe(meeting);
    });

    it('throws NotFoundException when no matching meeting exists', async () => {
      prisma.meeting.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('missing-id', ownerId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the meeting belongs to another user', async () => {
      prisma.meeting.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('meeting-1', 'another-user'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.meeting.findFirst).toHaveBeenCalledWith({
        where: { id: 'meeting-1', ownerId: 'another-user' },
      });
    });
  });
});
