import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MeetingFileService } from './meeting-file.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MeetingFileService', () => {
  let service: MeetingFileService;
  let prisma: {
    meetingFile: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const meetingId = 'meeting-1';
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

  beforeEach(async () => {
    prisma = {
      meetingFile: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
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
});
