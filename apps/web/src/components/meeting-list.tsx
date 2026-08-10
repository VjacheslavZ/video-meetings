import type { Meeting } from '@/lib/api';

function formatMeetingDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
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
          <span className="text-foreground text-sm font-medium">
            {meeting.title}
          </span>
          <span className="text-muted text-sm">
            {formatMeetingDate(meeting.date)}
          </span>
        </li>
      ))}
    </ul>
  );
}
