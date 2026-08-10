import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { AuthenticatedUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('MeetingController', () => {
  let controller: MeetingController;
  let meetingService: {
    create: jest.Mock;
    findAllForUser: jest.Mock;
    findOne: jest.Mock;
    acceptInvitation: jest.Mock;
    declineInvitation: jest.Mock;
  };

  const currentUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'owner@example.com',
  };

  beforeEach(async () => {
    meetingService = {
      create: jest.fn(),
      findAllForUser: jest.fn(),
      findOne: jest.fn(),
      acceptInvitation: jest.fn(),
      declineInvitation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeetingController],
      providers: [{ provide: MeetingService, useValue: meetingService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MeetingController>(MeetingController);
  });

  describe('create', () => {
    it('creates a meeting owned by the current user', async () => {
      const dto: CreateMeetingDto = {
        title: 'Sprint planning',
        date: '2026-08-10T10:00:00.000Z',
        participants: ['a@example.com', 'b@example.com'],
      };
      const created = { id: 'meeting-1', ownerId: currentUser.id, ...dto };
      meetingService.create.mockResolvedValue(created);

      const result = await controller.create(currentUser, dto);

      expect(meetingService.create).toHaveBeenCalledWith(currentUser.id, dto);
      expect(result).toBe(created);
    });
  });

  describe('findAll', () => {
    it("returns the current user's meetings", async () => {
      const meetings = [{ id: 'meeting-1', ownerId: currentUser.id }];
      meetingService.findAllForUser.mockResolvedValue(meetings);

      const result = await controller.findAll(currentUser);

      expect(meetingService.findAllForUser).toHaveBeenCalledWith(
        currentUser.id,
      );
      expect(result).toBe(meetings);
    });
  });

  describe('findOne', () => {
    it('returns the meeting when it exists and belongs to the current user', async () => {
      const meeting = { id: 'meeting-1', ownerId: currentUser.id };
      meetingService.findOne.mockResolvedValue(meeting);

      const result = await controller.findOne(currentUser, 'meeting-1');

      expect(meetingService.findOne).toHaveBeenCalledWith(
        'meeting-1',
        currentUser.id,
      );
      expect(result).toBe(meeting);
    });

    it('propagates a NotFoundException when the service reports none found', async () => {
      meetingService.findOne.mockRejectedValue(
        new NotFoundException('Meeting not found'),
      );

      await expect(
        controller.findOne(currentUser, 'missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('accept', () => {
    it("accepts the current user's invitation to the meeting", async () => {
      const meeting = { id: 'meeting-1', myStatus: 'ACCEPTED' };
      meetingService.acceptInvitation.mockResolvedValue(meeting);

      const result = await controller.accept(currentUser, 'meeting-1');

      expect(meetingService.acceptInvitation).toHaveBeenCalledWith(
        'meeting-1',
        currentUser.id,
      );
      expect(result).toBe(meeting);
    });

    it('propagates a NotFoundException when there is no invitation to accept', async () => {
      meetingService.acceptInvitation.mockRejectedValue(
        new NotFoundException('Invitation not found'),
      );

      await expect(
        controller.accept(currentUser, 'meeting-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('decline', () => {
    it("declines the current user's invitation to the meeting", async () => {
      const meeting = { id: 'meeting-1', myStatus: 'DECLINED' };
      meetingService.declineInvitation.mockResolvedValue(meeting);

      const result = await controller.decline(currentUser, 'meeting-1');

      expect(meetingService.declineInvitation).toHaveBeenCalledWith(
        'meeting-1',
        currentUser.id,
      );
      expect(result).toBe(meeting);
    });

    it('propagates a NotFoundException when there is no invitation to decline', async () => {
      meetingService.declineInvitation.mockRejectedValue(
        new NotFoundException('Invitation not found'),
      );

      await expect(
        controller.decline(currentUser, 'meeting-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
