import { Readable } from 'stream';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { MeetingFileController } from './meeting-file.controller';
import { MeetingFileService } from './meeting-file.service';
import { MeetingFileAccessGuard } from './meeting-file-access.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/current-user.decorator';

jest.mock('fs', () => {
  const actualFs: typeof import('fs') = jest.requireActual('fs');
  return {
    ...actualFs,
    createReadStream: jest.fn(() => Readable.from(Buffer.from('file bytes'))),
  };
});

describe('MeetingFileController', () => {
  let controller: MeetingFileController;
  let meetingFileService: {
    saveUploaded: jest.Mock;
    findAllForMeeting: jest.Mock;
    getOneForMeeting: jest.Mock;
    deleteFile: jest.Mock;
  };

  const currentUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'owner@example.com',
  };
  const meetingId = 'meeting-1';

  beforeEach(async () => {
    meetingFileService = {
      saveUploaded: jest.fn(),
      findAllForMeeting: jest.fn(),
      getOneForMeeting: jest.fn(),
      deleteFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeetingFileController],
      providers: [
        { provide: MeetingFileService, useValue: meetingFileService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(MeetingFileAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<MeetingFileController>(MeetingFileController);
  });

  describe('upload', () => {
    it("delegates to the service with the current user's id and uploaded files", async () => {
      const files = [{ originalname: 'report.pdf' }] as Express.Multer.File[];
      const created = [{ id: 'file-1', filename: 'report.pdf' }];
      meetingFileService.saveUploaded.mockResolvedValue(created);

      const result = await controller.upload(currentUser, meetingId, files);

      expect(meetingFileService.saveUploaded).toHaveBeenCalledWith(
        meetingId,
        currentUser.id,
        files,
      );
      expect(result).toBe(created);
    });
  });

  describe('findAll', () => {
    it("returns the meeting's files", async () => {
      const files = [{ id: 'file-1' }];
      meetingFileService.findAllForMeeting.mockResolvedValue(files);

      const result = await controller.findAll(meetingId);

      expect(meetingFileService.findAllForMeeting).toHaveBeenCalledWith(
        meetingId,
      );
      expect(result).toBe(files);
    });
  });

  describe('download', () => {
    it('streams the file back with the correct content type and disposition', async () => {
      meetingFileService.getOneForMeeting.mockResolvedValue({
        id: 'file-1',
        meetingId,
        storedName: 'generated-uuid',
        filename: 'report with spaces.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      });

      const result = await controller.download(meetingId, 'file-1');

      expect(meetingFileService.getOneForMeeting).toHaveBeenCalledWith(
        meetingId,
        'file-1',
      );
      expect(result).toBeInstanceOf(StreamableFile);
      const headers = result.getHeaders();
      expect(headers.type).toBe('application/pdf');
      expect(headers.length).toBe(1024);
      expect(headers.disposition).toContain(
        'filename="report with spaces.pdf"',
      );
      expect(headers.disposition).toContain(
        `filename*=UTF-8''${encodeURIComponent('report with spaces.pdf')}`,
      );
    });

    it('propagates a NotFoundException when the file does not belong to the meeting', async () => {
      meetingFileService.getOneForMeeting.mockRejectedValue(
        new NotFoundException('File not found'),
      );

      await expect(
        controller.download(meetingId, 'missing-file'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it("delegates to the service with the current user's id", async () => {
      meetingFileService.deleteFile.mockResolvedValue(undefined);

      const result = await controller.remove(currentUser, meetingId, 'file-1');

      expect(meetingFileService.deleteFile).toHaveBeenCalledWith(
        meetingId,
        'file-1',
        currentUser.id,
      );
      expect(result).toBeUndefined();
    });

    it('propagates a ForbiddenException from the service', async () => {
      meetingFileService.deleteFile.mockRejectedValue(
        new ForbiddenException(
          'Only the uploader or meeting owner can delete this file',
        ),
      );

      await expect(
        controller.remove(currentUser, meetingId, 'file-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('propagates a NotFoundException from the service', async () => {
      meetingFileService.deleteFile.mockRejectedValue(
        new NotFoundException('File not found'),
      );

      await expect(
        controller.remove(currentUser, meetingId, 'missing-file'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
