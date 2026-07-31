import { apiHeaders } from "../auth/session";

export interface ApiErrorBody {
  error?: string;
  message?: string;
}

function mergeHeaders(init: RequestInit): Headers {
  const headers = new Headers(apiHeaders() as Record<string, string>);
  if (init.headers) {
    const extra = new Headers(init.headers);
    extra.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  if (init.body instanceof FormData) {
    headers.delete("Content-Type");
  }
  return headers;
}

async function readApiError(res: Response): Promise<string> {
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as ApiErrorBody;
    message = body.error ?? body.message ?? message;
  } catch {
    // Non-JSON error body — keep status message.
  }
  return message;
}

/** Authenticated fetch — throws with server error message when `!res.ok`. */
export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: mergeHeaders(init),
  });
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Like `apiFetch` but returns `null` on 404 instead of throwing. */
export async function apiFetchOptional<T>(
  url: string,
  init: RequestInit = {},
): Promise<T | null> {
  const res = await fetch(url, {
    ...init,
    headers: mergeHeaders(init),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  if (res.status === 204) {
    return null;
  }
  return (await res.json()) as T;
}

/** Unwrap `{ data: T }` envelope from API responses. */
export function unwrapData<T>(body: { data?: T }): T {
  if (body.data === undefined) {
    throw new Error("Missing data in API response");
  }
  return body.data;
}

/** `apiFetch` + unwrap `{ data: T }`. */
export async function apiFetchData<T>(url: string, init: RequestInit = {}): Promise<T> {
  return unwrapData(await apiFetch<{ data?: T }>(url, init));
}

/** `apiFetchOptional` + unwrap `{ data: T }`; null when 404 or missing data. */
export async function apiFetchDataOptional<T>(
  url: string,
  init: RequestInit = {},
): Promise<T | null> {
  const body = await apiFetchOptional<{ data?: T }>(url, init);
  return body?.data ?? null;
}

/** PUT/POST/DELETE with no response body. */
export async function apiFetchVoid(url: string, init: RequestInit = {}): Promise<void> {
  await apiFetch<void>(url, init);
}
