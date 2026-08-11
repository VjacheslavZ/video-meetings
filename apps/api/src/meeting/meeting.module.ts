import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeetingFileAccessGuard } from '../meeting-file/meeting-file-access.guard';
import { MeetingFileController } from '../meeting-file/meeting-file.controller';
import { MeetingFileService } from '../meeting-file/meeting-file.service';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';

@Module({
  imports: [AuthModule],
  controllers: [MeetingController, MeetingFileController],
  providers: [MeetingService, MeetingFileService, MeetingFileAccessGuard],
  exports: [MeetingService],
})
export class MeetingModule {}
