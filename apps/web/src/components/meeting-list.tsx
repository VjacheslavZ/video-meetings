import { Chip } from '@heroui/react';
import type { Meeting, ParticipationStatus } from '@/lib/api';

function formatMeetingDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

const STATUS_LABEL: Record<ParticipationStatus, string> = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
};

const STATUS_COLOR: Record<
  ParticipationStatus,
  'warning' | 'success' | 'danger'
> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  DECLINED: 'danger',
};

function MeetingBadge({ meeting }: { meeting: Meeting }) {
  if (meeting.role === 'OWNER') {
    return (
      <Chip color="default" size="sm">
        Owner
      </Chip>
    );
  }

  const status = meeting.myStatus ?? 'PENDING';
  return (
    <Chip color={STATUS_COLOR[status]} size="sm">
      {STATUS_LABEL[status]}
    </Chip>
  );
}

interface MeetingListProps {
  meetings: Meeting[];
  emptyMessage: string;
}

export function MeetingList({ meetings, emptyMessage }: MeetingListProps) {
  if (meetings.length === 0) {
    return (
      <p className="text-muted py-6 text-center text-sm">{emptyMessage}</p>
    );
  }

  return (
    <ul className="divide-border flex flex-col divide-y">
      {meetings.map((meeting) => (
        <li
          key={meeting.id}
          className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <span
            className="text-foreground min-w-0 truncate text-sm font-medium"
            title={meeting.title}
          >
            {meeting.title}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="text-muted text-sm">
              {formatMeetingDate(meeting.date)}
            </span>
            <MeetingBadge meeting={meeting} />
          </span>
        </li>
      ))}
    </ul>
  );
}
