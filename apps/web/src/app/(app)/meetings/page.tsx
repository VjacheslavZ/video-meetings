'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Spinner } from '@heroui/react';
import { MeetingList } from '@/components/meeting-list';
import { ApiError, getMeetings, type Meeting } from '@/lib/api';
import { clearAccessToken, getAccessToken } from '@/lib/auth';

export default function MeetingsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  // Captured once when the data loads, rather than read via Date.now()
  // during render, so upcoming/past bucketing stays stable across
  // re-renders instead of a meeting silently flipping buckets mid-visit.
  const [asOf, setAsOf] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Token is guaranteed to exist here: this page only ever renders
    // inside the (app) layout, which already redirected to /login
    // otherwise.
    const token = getAccessToken();
    if (!token) return;

    getMeetings(token)
      .then((data) => {
        if (cancelled) return;
        setMeetings(data);
        setAsOf(Date.now());
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearAccessToken();
          router.replace('/login');
          return;
        }
        setError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load meetings. Please try again.',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const upcoming =
    asOf === null
      ? []
      : meetings
          .filter((meeting) => new Date(meeting.date).getTime() >= asOf)
          .sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
  const past =
    asOf === null
      ? []
      : meetings
          .filter((meeting) => new Date(meeting.date).getTime() < asOf)
          .sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-foreground text-lg font-semibold">All meetings</h1>
        <Button size="sm" onPress={() => router.push('/meetings/new')}>
          New meeting
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : error ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{error}</Alert.Title>
          </Alert.Content>
        </Alert>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-foreground text-sm font-semibold">Upcoming</h2>
            <Card className="p-6">
              <MeetingList
                meetings={upcoming}
                emptyMessage="No upcoming meetings."
              />
            </Card>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-foreground text-sm font-semibold">Past</h2>
            <Card className="p-6">
              <MeetingList meetings={past} emptyMessage="No past meetings." />
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
