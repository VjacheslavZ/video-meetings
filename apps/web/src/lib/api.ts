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

export type ParticipationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface MeetingParticipant {
  userId: string;
  email: string;
  status: ParticipationStatus;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  ownerId: string;
  role: 'OWNER' | 'PARTICIPANT';
  myStatus: ParticipationStatus | null;
  participants: MeetingParticipant[];
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

export interface CreateMeetingPayload {
  title: string;
  date: string;
  participants: string[];
}

export async function createMeeting(
  accessToken: string,
  payload: CreateMeetingPayload,
): Promise<Meeting> {
  const res = await fetch(`${API_URL}/meetings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to create meeting.');
  }

  return res.json();
}

export async function getMeeting(
  accessToken: string,
  id: string,
): Promise<Meeting> {
  const res = await fetch(`${API_URL}/meetings/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to load meeting.');
  }

  return res.json();
}

export async function acceptMeetingInvitation(
  accessToken: string,
  id: string,
): Promise<Meeting> {
  const res = await fetch(`${API_URL}/meetings/${id}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to accept invitation.');
  }

  return res.json();
}

export async function declineMeetingInvitation(
  accessToken: string,
  id: string,
): Promise<Meeting> {
  const res = await fetch(`${API_URL}/meetings/${id}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to decline invitation.');
  }

  return res.json();
}

export async function addMeetingParticipants(
  accessToken: string,
  id: string,
  participants: string[],
): Promise<Meeting> {
  const res = await fetch(`${API_URL}/meetings/${id}/participants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ participants }),
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to add participant.');
  }

  return res.json();
}

export async function removeMeetingParticipant(
  accessToken: string,
  id: string,
  userId: string,
): Promise<Meeting> {
  const res = await fetch(`${API_URL}/meetings/${id}/participants/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to remove participant.');
  }

  return res.json();
}

export interface MeetingFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedById: string;
  uploaderEmail: string;
  createdAt: string;
}

export async function uploadMeetingFiles(
  accessToken: string,
  meetingId: string,
  files: File[],
): Promise<MeetingFile[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const res = await fetch(`${API_URL}/meetings/${meetingId}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to upload file(s).');
  }

  return res.json();
}

export async function getMeetingFiles(
  accessToken: string,
  meetingId: string,
): Promise<MeetingFile[]> {
  const res = await fetch(`${API_URL}/meetings/${meetingId}/files`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to load files.');
  }

  return res.json();
}

export async function deleteMeetingFile(
  accessToken: string,
  meetingId: string,
  fileId: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/meetings/${meetingId}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to delete file.');
  }
}

export async function downloadMeetingFile(
  accessToken: string,
  meetingId: string,
  fileId: string,
  filename: string,
): Promise<void> {
  const res = await fetch(`${API_URL}/meetings/${meetingId}/files/${fileId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw await buildApiError(res, 'Failed to download file.');
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
