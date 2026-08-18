const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(`${API_BASE}${path}`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('lsn_token');
}

export async function api<T = unknown>(path: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOpts } = options;
  const url = buildUrl(path, params);
  const token = getToken();

  const headers: Record<string, string> = {
    ...(fetchOpts.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary automatically)
  if (!(fetchOpts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...fetchOpts,
    headers,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = new Error((body as { error?: string }).error || `API error ${res.status}`);
    (err as unknown as { status: number }).status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

// Auth helpers
export async function login(email: string, password: string) {
  const data = await api<{ accessToken: string; refreshToken: string; user: Record<string, unknown> }>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) }
  );
  localStorage.setItem('lsn_token', data.accessToken);
  localStorage.setItem('lsn_refresh', data.refreshToken);
  return data;
}

export async function getMe() {
  return api<{
    user: { id: string; email: string; name: string };
    isAdmin: boolean;
    role: string | null;
    permissions: string[];
  }>('/auth/me');
}

export function logout() {
  localStorage.removeItem('lsn_token');
  localStorage.removeItem('lsn_refresh');
}

// Paginated response type
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
