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
import { ApiError, registerUser } from '@/lib/api';

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.26 9.26 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = String(formData.get('name') ?? '');
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    setIsSubmitting(true);
    try {
      const { accessToken } = await registerUser({ name, email, password });
      localStorage.setItem('accessToken', accessToken);
      router.push('/');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Registration failed. Please try again.',
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
              Create an account
            </h1>
            <p className="text-muted text-sm">
              Sign up to start scheduling meetings
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
                  name="name"
                  type="text"
                  autoComplete="name"
                >
                  <Label>Name</Label>
                  <Input placeholder="Jane Doe" variant="secondary" />
                  <FieldError />
                </TextField>

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
                  autoComplete="new-password"
                  validate={(value) => {
                    if (value.length > 0 && value.length < 8) {
                      return 'Password must be at least 8 characters';
                    }
                    return null;
                  }}
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
                {isSubmitting ? 'Creating account…' : 'Create account'}
              </Button>
              <p className="text-muted text-center text-sm">
                Already have an account? <Link href="/login">Sign in</Link>
              </p>
            </Card.Footer>
          </Form>
        </Card>
      </div>
    </main>
  );
}
