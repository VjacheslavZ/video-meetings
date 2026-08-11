import { createReadStream } from 'fs';
import { join } from 'path';
import {
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MeetingFileAccessGuard } from './meeting-file-access.guard';
import { MeetingFileService } from './meeting-file.service';
import { buildContentDisposition } from './upload/content-disposition.util';
import { multerOptions, UPLOADS_DIR } from './upload/multer.config';
import { MAX_FILES_PER_REQUEST } from './upload/upload.constants';

@UseGuards(JwtAuthGuard, MeetingFileAccessGuard)
@Controller('meetings/:meetingId/files')
export class MeetingFileController {
  constructor(private readonly meetingFileService: MeetingFileService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, multerOptions),
  )
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('meetingId') meetingId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.meetingFileService.saveUploaded(meetingId, user.id, files);
  }

  @Get()
  findAll(@Param('meetingId') meetingId: string) {
    return this.meetingFileService.findAllForMeeting(meetingId);
  }

  @Get(':fileId')
  async download(
    @Param('meetingId') meetingId: string,
    @Param('fileId') fileId: string,
  ): Promise<StreamableFile> {
    const file = await this.meetingFileService.getOneForMeeting(
      meetingId,
      fileId,
    );
    const stream = createReadStream(join(UPLOADS_DIR, file.storedName));
    return new StreamableFile(stream, {
      type: file.mimeType,
      disposition: buildContentDisposition(file.filename),
      length: file.size,
    });
  }
}
