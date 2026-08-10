'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Link, Spinner } from '@heroui/react';
import {
  clearAccessToken,
  decodeAccessToken,
  getAccessToken,
} from '@/lib/auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    const payload = token ? decodeAccessToken(token) : null;

    if (!token || !payload?.email) {
      clearAccessToken();
      router.replace('/login');
      return;
    }

    // Reading the token is synchronizing with an external system
    // (localStorage), which can only happen client-side after mount —
    // there's no async boundary to defer these updates behind.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUserEmail(payload.email);
    setIsLoading(false);
  }, [router]);

  const onLogout = () => {
    clearAccessToken();
    router.push('/login');
  };

  if (isLoading) {
    return (
      <main className="bg-background-secondary flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </main>
    );
  }

  return (
    <div className="bg-background-secondary min-h-screen">
      <header className="bg-background border-border flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <div className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">
            VM
          </div>
          <span className="text-foreground hidden font-semibold sm:inline">
            Video Meetings
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="text-muted max-w-[9rem] truncate text-sm sm:max-w-none">
            {userEmail}
          </span>
          <Button
            className="shrink-0"
            variant="outline"
            size="sm"
            onPress={onLogout}
          >
            Log out
          </Button>
        </div>
      </header>

      {children}
    </div>
  );
}
