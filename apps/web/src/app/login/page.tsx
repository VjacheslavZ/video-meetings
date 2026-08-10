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
  InputGroup,
  Label,
  Link,
  TextField,
} from '@heroui/react';
import { EyeIcon, EyeOffIcon } from '@/components/icons';
import { ApiError, loginUser } from '@/lib/api';
import { setAccessToken } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    setIsSubmitting(true);
    try {
      const { accessToken } = await loginUser({ email, password });
      setAccessToken(accessToken);
      router.push('/');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Sign in failed. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="bg-background-secondary flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="bg-accent text-accent-foreground flex size-11 items-center justify-center rounded-2xl text-lg font-semibold">
            VM
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-foreground text-xl font-semibold">
              Welcome back
            </h1>
            <p className="text-muted text-sm">
              Sign in to manage your meetings
            </p>
          </div>
        </div>

        <Card className="w-full gap-6 p-6 sm:p-8">
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

                <TextField
                  isRequired
                  fullWidth
                  name="email"
                  type="email"
                  autoComplete="email"
                >
                  <Label>Email</Label>
                  <Input placeholder="jane@example.com" variant="secondary" />
                  <FieldError />
                </TextField>

                <TextField
                  isRequired
                  fullWidth
                  name="password"
                  autoComplete="current-password"
                >
                  <Label>Password</Label>
                  <InputGroup fullWidth variant="secondary">
                    <InputGroup.Input
                      type={isPasswordVisible ? 'text' : 'password'}
                    />
                    <InputGroup.Suffix className="pr-0">
                      <Button
                        isIconOnly
                        aria-label={
                          isPasswordVisible ? 'Hide password' : 'Show password'
                        }
                        size="sm"
                        variant="ghost"
                        onPress={() => setIsPasswordVisible((v) => !v)}
                      >
                        {isPasswordVisible ? (
                          <EyeOffIcon className="size-4" />
                        ) : (
                          <EyeIcon className="size-4" />
                        )}
                      </Button>
                    </InputGroup.Suffix>
                  </InputGroup>
                  <FieldError />
                </TextField>
              </div>
            </Card.Content>

            <Card.Footer className="mt-6 flex flex-col gap-4">
              <Button
                className="w-full"
                isDisabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
              <p className="text-muted text-center text-sm">
                Don&apos;t have an account?{' '}
                <Link href="/register">Sign up</Link>
              </p>
            </Card.Footer>
          </Form>
        </Card>
      </div>
    </main>
  );
}
