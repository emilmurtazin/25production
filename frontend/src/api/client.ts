const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let currentToken: string | null = localStorage.getItem('token');

export function setToken(token: string | null) {
  currentToken = token;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export function getToken(): string | null {
  return currentToken;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : undefined;

  if (!res.ok) {
    const message = (data && (data as { error?: string }).error) || `Ошибка запроса (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}
