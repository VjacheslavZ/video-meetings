const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function buildApiError(
  res: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const message =
    (Array.isArray(body?.message) ? body.message[0] : body?.message) ??
    fallbackMessage;
  return new ApiError(message, res.status);
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
}

export async function registerUser(
  payload: RegisterPayload,
): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Registration failed. Please try again.');
  }

  return res.json();
}

export async function loginUser(payload: LoginPayload): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Invalid email or password.');
  }

  return res.json();
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  participants: string[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export async function getMeetings(accessToken: string): Promise<Meeting[]> {
  const res = await fetch(`${API_URL}/meetings`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to load meetings.');
  }

  return res.json();
}
