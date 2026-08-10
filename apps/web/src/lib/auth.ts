const ACCESS_TOKEN_KEY = 'accessToken';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  name?: string;
}

/**
 * Decodes the JWT payload for display purposes only (e.g. showing the
 * signed-in user's email) — this does not verify the signature. Every
 * authenticated API call is still independently verified server-side.
 */
export function decodeAccessToken(token: string): AccessTokenPayload | null {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
