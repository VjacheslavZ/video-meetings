import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { MeetingFileAccessGuard } from './meeting-file-access.guard';
import { MeetingService } from '../meeting/meeting.service';

describe('MeetingFileAccessGuard', () => {
  let guard: MeetingFileAccessGuard;
  let meetingService: { hasAccess: jest.Mock };

  const userId = 'user-1';
  const meetingId = 'meeting-1';

  beforeEach(() => {
    meetingService = { hasAccess: jest.fn() };
    guard = new MeetingFileAccessGuard(
      meetingService as unknown as MeetingService,
    );
  });

  function contextWith(params: Record<string, string>) {
    const request = { params, user: { id: userId } };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('allows the request when the user owns or participates in the meeting', async () => {
    meetingService.hasAccess.mockResolvedValue(true);

    const result = await guard.canActivate(contextWith({ meetingId }));

    expect(meetingService.hasAccess).toHaveBeenCalledWith(meetingId, userId);
    expect(result).toBe(true);
  });

  it('throws NotFoundException when the user has no access to the meeting', async () => {
    meetingService.hasAccess.mockResolvedValue(false);

    await expect(
      guard.canActivate(contextWith({ meetingId })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
