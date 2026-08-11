import { join } from 'path';
import { unlink } from 'fs/promises';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeetingFile, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOADS_DIR } from './upload/multer.config';

type MeetingFileWithUploader = MeetingFile & { uploadedBy: User };

@Injectable()
export class MeetingFileService {
  constructor(private readonly prisma: PrismaService) {}

  async saveUploaded(
    meetingId: string,
    uploadedById: string,
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const created = await this.prisma.$transaction(
      files.map((file) =>
        this.prisma.meetingFile.create({
          data: {
            meetingId,
            uploadedById,
            filename: file.originalname,
            storedName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
          },
          include: { uploadedBy: true },
        }),
      ),
    );

    return created.map((file) => this.toResponse(file));
  }

  async findAllForMeeting(meetingId: string) {
    const files = await this.prisma.meetingFile.findMany({
      where: { meetingId },
      include: { uploadedBy: true },
      orderBy: { createdAt: 'asc' },
    });

    return files.map((file) => this.toResponse(file));
  }

  async getOneForMeeting(
    meetingId: string,
    fileId: string,
  ): Promise<MeetingFile> {
    const file = await this.prisma.meetingFile.findFirst({
      where: { id: fileId, meetingId },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  async deleteFile(
    meetingId: string,
    fileId: string,
    userId: string,
  ): Promise<void> {
    const file = await this.prisma.meetingFile.findFirst({
      where: { id: fileId, meetingId },
      include: { meeting: true },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    if (file.uploadedById !== userId && file.meeting.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the uploader or meeting owner can delete this file',
      );
    }

    await this.prisma.meetingFile.delete({ where: { id: fileId } });
    await unlink(join(UPLOADS_DIR, file.storedName));
  }

  private toResponse(file: MeetingFileWithUploader) {
    return {
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      uploadedById: file.uploadedById,
      uploaderEmail: file.uploadedBy.email,
      createdAt: file.createdAt,
    };
  }
}
