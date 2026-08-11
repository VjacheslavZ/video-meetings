import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/current-user.decorator';
import { MeetingService } from '../meeting/meeting.service';

@Injectable()
export class MeetingFileAccessGuard implements CanActivate {
  constructor(private readonly meetingService: MeetingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    const meetingId = request.params.meetingId as string;
    const hasAccess = await this.meetingService.hasAccess(
      meetingId,
      request.user.id,
    );
    if (!hasAccess) {
      throw new NotFoundException('Meeting not found');
    }
    return true;
  }
}
