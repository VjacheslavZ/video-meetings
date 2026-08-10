'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Card, Link, Spinner } from '@heroui/react';
import { MeetingList } from '@/components/meeting-list';
import { ApiError, getMeetings, type Meeting } from '@/lib/api';
import { clearAccessToken, getAccessToken } from '@/lib/auth';

const RECENT_MEETINGS_COUNT = 3;

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
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
        const recent = [...data]
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .slice(0, RECENT_MEETINGS_COUNT);
        setMeetings(recent);
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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-foreground text-lg font-semibold">
          Recent meetings
        </h1>
        <Link href="/meetings" className="text-sm">
          View all
        </Link>
      </div>

      <Card className="p-6">
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
          <MeetingList
            meetings={meetings}
            emptyMessage="You haven't created any meetings yet."
          />
        )}
      </Card>
    </div>
  );
}
