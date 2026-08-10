'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Chip,
  FieldError,
  Form,
  Input,
  Link,
  Spinner,
  TextField,
} from '@heroui/react';
import { XIcon } from '@/components/icons';
import {
  acceptMeetingInvitation,
  addMeetingParticipants,
  ApiError,
  declineMeetingInvitation,
  getMeeting,
  removeMeetingParticipant,
  type Meeting,
  type ParticipationStatus,
} from '@/lib/api';
import { clearAccessToken, getAccessToken } from '@/lib/auth';

function formatMeetingDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
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

function parseEmails(value: string): string[] {
  return value
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

  const [isLoading, setIsLoading] = useState(true);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isResponding, setIsResponding] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();
    if (!token) return;

    getMeeting(token, meetingId)
      .then((data) => {
        if (cancelled) return;
        setMeeting(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearAccessToken();
          router.replace('/login');
          return;
        }
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This meeting doesn't exist or you don't have access to it."
            : 'Failed to load meeting. Please try again.',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [meetingId, router]);

  const withToken = (fn: (token: string) => Promise<Meeting>) => {
    const token = getAccessToken();
    if (!token) return null;
    return fn(token);
  };

  const onAccept = async () => {
    setResponseError(null);
    setIsResponding(true);
    try {
      const updated = await withToken((token) =>
        acceptMeetingInvitation(token, meetingId),
      );
      if (updated) setMeeting(updated);
    } catch (err) {
      setResponseError(
        err instanceof ApiError
          ? err.message
          : 'Failed to accept invitation. Please try again.',
      );
    } finally {
      setIsResponding(false);
    }
  };

  const onDecline = async () => {
    setResponseError(null);
    setIsResponding(true);
    try {
      const updated = await withToken((token) =>
        declineMeetingInvitation(token, meetingId),
      );
      if (updated) setMeeting(updated);
    } catch (err) {
      setResponseError(
        err instanceof ApiError
          ? err.message
          : 'Failed to decline invitation. Please try again.',
      );
    } finally {
      setIsResponding(false);
    }
  };

  const onAddParticipants = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddError(null);

    const formData = new FormData(e.currentTarget);
    const emails = parseEmails(String(formData.get('participants') ?? ''));

    setIsAdding(true);
    try {
      const updated = await withToken((token) =>
        addMeetingParticipants(token, meetingId, emails),
      );
      if (updated) {
        setMeeting(updated);
        e.currentTarget.reset();
      }
    } catch (err) {
      setAddError(
        err instanceof ApiError
          ? err.message
          : 'Failed to add participant. Please try again.',
      );
    } finally {
      setIsAdding(false);
    }
  };

  const onRemoveParticipant = async (userId: string) => {
    setRemoveError(null);
    setRemovingUserId(userId);
    try {
      const updated = await withToken((token) =>
        removeMeetingParticipant(token, meetingId, userId),
      );
      if (updated) setMeeting(updated);
    } catch (err) {
      setRemoveError(
        err instanceof ApiError
          ? err.message
          : 'Failed to remove participant. Please try again.',
      );
    } finally {
      setRemovingUserId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (loadError || !meeting) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{loadError ?? 'Meeting not found.'}</Alert.Title>
          </Alert.Content>
        </Alert>
        <Link href="/meetings" className="text-sm">
          Back to meetings
        </Link>
      </div>
    );
  }

  const isOwner = meeting.role === 'OWNER';
  const isPendingInvitee =
    meeting.role === 'PARTICIPANT' && meeting.myStatus === 'PENDING';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-foreground text-lg font-semibold">
          {meeting.title}
        </h1>
        <Link href="/meetings" className="text-sm">
          Back to meetings
        </Link>
      </div>

      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-muted text-sm">
            {formatMeetingDate(meeting.date)}
          </span>
          {isOwner ? (
            <Chip color="default" size="sm">
              Owner
            </Chip>
          ) : (
            <Chip color={STATUS_COLOR[meeting.myStatus ?? 'PENDING']} size="sm">
              {STATUS_LABEL[meeting.myStatus ?? 'PENDING']}
            </Chip>
          )}
        </div>

        {isPendingInvitee ? (
          <div className="flex flex-col gap-3 border-t border-dashed pt-4">
            {responseError ? (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{responseError}</Alert.Title>
                </Alert.Content>
              </Alert>
            ) : null}
            <div className="flex gap-3">
              <Button
                isDisabled={isResponding}
                onPress={onAccept}
                className="flex-1"
              >
                Accept
              </Button>
              <Button
                isDisabled={isResponding}
                variant="outline"
                onPress={onDecline}
                className="flex-1"
              >
                Decline
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-sm font-semibold">Participants</h2>
        <Card className="flex flex-col gap-4 p-6">
          {meeting.participants.length === 0 ? (
            <p className="text-muted py-2 text-center text-sm">
              No participants yet.
            </p>
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {meeting.participants.map((participant) => (
                <li
                  key={participant.userId}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    className="text-foreground min-w-0 truncate text-sm"
                    title={participant.email}
                  >
                    {participant.email}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Chip color={STATUS_COLOR[participant.status]} size="sm">
                      {STATUS_LABEL[participant.status]}
                    </Chip>
                    {isOwner ? (
                      <AlertDialog>
                        <Button
                          isIconOnly
                          aria-label={`Remove ${participant.email}`}
                          variant="ghost"
                          size="sm"
                          isDisabled={removingUserId === participant.userId}
                        >
                          <XIcon className="size-4" />
                        </Button>
                        <AlertDialog.Backdrop>
                          <AlertDialog.Container>
                            <AlertDialog.Dialog className="sm:max-w-[400px]">
                              <AlertDialog.CloseTrigger />
                              <AlertDialog.Header>
                                <AlertDialog.Icon status="danger" />
                                <AlertDialog.Heading>
                                  Remove participant?
                                </AlertDialog.Heading>
                              </AlertDialog.Header>
                              <AlertDialog.Body>
                                <p>
                                  Remove <strong>{participant.email}</strong>{' '}
                                  from this meeting? They will lose access
                                  immediately.
                                </p>
                              </AlertDialog.Body>
                              <AlertDialog.Footer>
                                <Button slot="close" variant="tertiary">
                                  Cancel
                                </Button>
                                <Button
                                  slot="close"
                                  variant="danger"
                                  onPress={() =>
                                    onRemoveParticipant(participant.userId)
                                  }
                                >
                                  Remove
                                </Button>
                              </AlertDialog.Footer>
                            </AlertDialog.Dialog>
                          </AlertDialog.Container>
                        </AlertDialog.Backdrop>
                      </AlertDialog>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {isOwner ? (
            <div className="flex flex-col gap-2 border-t pt-4">
              {removeError ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{removeError}</Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : null}
              {addError ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{addError}</Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : null}
              <Form onSubmit={onAddParticipants}>
                <div className="flex items-start gap-3">
                  <TextField
                    isRequired
                    fullWidth
                    name="participants"
                    aria-label="Participant emails to invite"
                    validate={(value) =>
                      parseEmails(value).length === 0
                        ? 'Add at least one participant email'
                        : null
                    }
                  >
                    <Input
                      placeholder="jane@example.com, john@example.com"
                      variant="secondary"
                    />
                    <FieldError />
                  </TextField>
                  <Button type="submit" isDisabled={isAdding}>
                    {isAdding ? 'Inviting…' : 'Invite'}
                  </Button>
                </div>
              </Form>
              <p className="text-muted text-xs">
                Separate multiple emails with commas. Each must belong to a
                registered user.
              </p>
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
