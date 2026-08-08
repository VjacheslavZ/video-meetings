import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';

@Module({
  imports: [AuthModule],
  controllers: [MeetingController],
  providers: [MeetingService],
})
export class MeetingModule {}
