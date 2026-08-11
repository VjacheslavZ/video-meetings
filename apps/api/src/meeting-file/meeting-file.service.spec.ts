import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MeetingFileService } from './meeting-file.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('fs/promises', () => ({ unlink: jest.fn() }));

describe('MeetingFileService', () => {
  let service: MeetingFileService;
  let prisma: {
    meetingFile: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const meetingId = 'meeting-1';
  const ownerId = 'owner-1';
  const uploader = { id: 'user-1', email: 'owner@example.com' };

  function multerFile(overrides: Partial<Express.Multer.File> = {}) {
    return {
      originalname: 'report.pdf',
      filename: 'generated-uuid',
      mimetype: 'application/pdf',
      size: 1024,
      ...overrides,
    } as Express.Multer.File;
  }

  function meetingFileRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'file-1',
      meetingId,
      uploadedById: uploader.id,
      filename: 'report.pdf',
      storedName: 'generated-uuid',
      mimeType: 'application/pdf',
      size: 1024,
      createdAt: new Date('2026-08-10T10:00:00.000Z'),
      uploadedBy: uploader,
      ...overrides,
    };
  }

  function meetingFileRowWithMeeting(overrides: Record<string, unknown> = {}) {
    return {
      ...meetingFileRow(),
      meeting: { id: meetingId, ownerId },
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = {
      meetingFile: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingFileService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MeetingFileService>(MeetingFileService);
  });

  describe('saveUploaded', () => {
    it('persists metadata for every uploaded file and returns it mapped with uploader email', async () => {
      const files = [
        multerFile({ originalname: 'report.pdf' }),
        multerFile({
          originalname: 'notes.txt',
          filename: 'generated-uuid-2',
          mimetype: 'text/plain',
          size: 42,
        }),
      ];
      prisma.meetingFile.create
        .mockResolvedValueOnce(meetingFileRow())
        .mockResolvedValueOnce(
          meetingFileRow({
            id: 'file-2',
            filename: 'notes.txt',
            storedName: 'generated-uuid-2',
            mimeType: 'text/plain',
            size: 42,
          }),
        );

      const result = await service.saveUploaded(meetingId, uploader.id, files);

      expect(prisma.meetingFile.create).toHaveBeenCalledTimes(2);
      expect(prisma.meetingFile.create).toHaveBeenNthCalledWith(1, {
        data: {
          meetingId,
          uploadedById: uploader.id,
          filename: 'report.pdf',
          storedName: 'generated-uuid',
          mimeType: 'application/pdf',
          size: 1024,
        },
        include: { uploadedBy: true },
      });
      expect(result).toEqual([
        expect.objectContaining({
          id: 'file-1',
          filename: 'report.pdf',
          uploaderEmail: uploader.email,
        }),
        expect.objectContaining({
          id: 'file-2',
          filename: 'notes.txt',
          uploaderEmail: uploader.email,
        }),
      ]);
    });

    it('throws BadRequestException when no files are provided', async () => {
      await expect(
        service.saveUploaded(meetingId, uploader.id, []),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.meetingFile.create).not.toHaveBeenCalled();
    });
  });

  describe('findAllForMeeting', () => {
    it("returns the meeting's files ordered by creation date, mapped with uploader email", async () => {
      prisma.meetingFile.findMany.mockResolvedValue([meetingFileRow()]);

      const result = await service.findAllForMeeting(meetingId);

      expect(prisma.meetingFile.findMany).toHaveBeenCalledWith({
        where: { meetingId },
        include: { uploadedBy: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        expect.objectContaining({
          id: 'file-1',
          uploaderEmail: uploader.email,
        }),
      ]);
    });
  });

  describe('getOneForMeeting', () => {
    it('returns the raw file record when it belongs to the meeting', async () => {
      const row = meetingFileRow();
      prisma.meetingFile.findFirst.mockResolvedValue(row);

      const result = await service.getOneForMeeting(meetingId, 'file-1');

      expect(prisma.meetingFile.findFirst).toHaveBeenCalledWith({
        where: { id: 'file-1', meetingId },
      });
      expect(result).toBe(row);
    });

    it('throws NotFoundException when the file does not exist for the meeting', async () => {
      prisma.meetingFile.findFirst.mockResolvedValue(null);

      await expect(
        service.getOneForMeeting(meetingId, 'missing-file'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deleteFile', () => {
    const { unlink } = jest.requireMock<{ unlink: jest.Mock }>('fs/promises');

    beforeEach(() => {
      unlink.mockReset().mockResolvedValue(undefined);
    });

    it('deletes the row and unlinks the on-disk file when the caller is the uploader', async () => {
      const row = meetingFileRowWithMeeting();
      prisma.meetingFile.findFirst.mockResolvedValue(row);
      prisma.meetingFile.delete.mockResolvedValue(row);

      await service.deleteFile(meetingId, 'file-1', uploader.id);

      expect(prisma.meetingFile.findFirst).toHaveBeenCalledWith({
        where: { id: 'file-1', meetingId },
        include: { meeting: true },
      });
      expect(prisma.meetingFile.delete).toHaveBeenCalledWith({
        where: { id: 'file-1' },
      });
      expect(unlink).toHaveBeenCalledWith(
        expect.stringContaining('generated-uuid'),
      );
    });

    it('deletes a participant file when the caller is the meeting owner', async () => {
      const row = meetingFileRowWithMeeting();
      prisma.meetingFile.findFirst.mockResolvedValue(row);
      prisma.meetingFile.delete.mockResolvedValue(row);

      await service.deleteFile(meetingId, 'file-1', ownerId);

      expect(prisma.meetingFile.delete).toHaveBeenCalledWith({
        where: { id: 'file-1' },
      });
    });

    it('throws ForbiddenException when the caller is neither the uploader nor the owner', async () => {
      const row = meetingFileRowWithMeeting();
      prisma.meetingFile.findFirst.mockResolvedValue(row);

      await expect(
        service.deleteFile(meetingId, 'file-1', 'someone-else'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.meetingFile.delete).not.toHaveBeenCalled();
      expect(unlink).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the file does not belong to the meeting', async () => {
      prisma.meetingFile.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteFile(meetingId, 'missing-file', uploader.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.meetingFile.delete).not.toHaveBeenCalled();
    });
  });
});
