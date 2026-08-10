'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Link,
  TextField,
} from '@heroui/react';
import { ApiError, createMeeting } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

function parseEmails(value: string): string[] {
  return value
    .split(',')
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

export default function NewMeetingPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const token = getAccessToken();
    if (!token) return;

    const formData = new FormData(e.currentTarget);
    const title = String(formData.get('title') ?? '');
    const date = String(formData.get('date') ?? '');
    const participants = parseEmails(
      String(formData.get('participants') ?? ''),
    );

    setIsSubmitting(true);
    try {
      await createMeeting(token, {
        title,
        date: new Date(date).toISOString(),
        participants,
      });
      router.push('/meetings');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to create meeting. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-foreground text-lg font-semibold">New meeting</h1>
        <Link href="/meetings" className="text-sm">
          Back to meetings
        </Link>
      </div>

      <Card className="p-6 sm:p-8">
        <Form onSubmit={onSubmit}>
          <Card.Content className="gap-0">
            <div className="flex flex-col gap-5">
              {error ? (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{error}</Alert.Title>
                  </Alert.Content>
                </Alert>
              ) : null}

              <TextField isRequired fullWidth name="title" type="text">
                <Label>Title</Label>
                <Input placeholder="Sprint planning" variant="secondary" />
                <FieldError />
              </TextField>

              <TextField isRequired fullWidth name="date">
                <Label>Date &amp; time</Label>
                <Input type="datetime-local" variant="secondary" />
                <FieldError />
              </TextField>

              <TextField
                isRequired
                fullWidth
                name="participants"
                validate={(value) =>
                  parseEmails(value).length === 0
                    ? 'Add at least one participant email'
                    : null
                }
              >
                <Label>Invite participants</Label>
                <Input
                  placeholder="jane@example.com, john@example.com"
                  variant="secondary"
                />
                <FieldError />
              </TextField>
              <p className="text-muted -mt-3 text-xs">
                Separate multiple emails with commas. Each must belong to a
                registered user.
              </p>
            </div>
          </Card.Content>

          <Card.Footer className="mt-6">
            <Button className="w-full" isDisabled={isSubmitting} type="submit">
              {isSubmitting ? 'Creating…' : 'Create meeting'}
            </Button>
          </Card.Footer>
        </Form>
      </Card>
    </div>
  );
}
