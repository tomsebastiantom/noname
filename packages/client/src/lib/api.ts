import { apiHeaders, redirectToLoginAfterUnauthorized } from "../auth/session";

export interface ApiErrorBody {
  error?: string;
  message?: string;
}

const AUTH_REQUIRED_MESSAGE =
  "Please sign in to edit this page (admin@zitadel.localhost on yogastore.localhost:5173).";

/** Thrown when the API returns 401 — session missing or expired. */
export class ApiAuthError extends Error {
  constructor(message = AUTH_REQUIRED_MESSAGE) {
    super(message);
    this.name = "ApiAuthError";
  }
}

/** Thrown when the API returns 409 — optimistic-lock conflict. */
export class ApiConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiConflictError";
  }
}

export function isAuthError(err: unknown): boolean {
  if (err instanceof ApiAuthError) return true;
  if (err instanceof Error && err.message.includes("Please sign in to edit")) return true;
  return false;
}

export function isAuthErrorMessage(message: string | null | undefined): boolean {
  return Boolean(message?.includes("Please sign in to edit"));
}

/** Turn browser "Failed to fetch" into something actionable in the UI. */
export function formatApiError(err: unknown, context?: string): string {
  const prefix = context ? `${context}: ` : "";
  if (err instanceof Error) {
    const msg = err.message;
    if (msg === "Failed to fetch" || msg === "NetworkError when attempting to fetch resource.") {
      return `${prefix}Could not reach the API. Run \`pnpm dev\`, then use a store host like yogastore.localhost:5173 and sign in as admin.`;
    }
    if (msg.startsWith("Failed to fetch dynamically imported module")) {
      return `${prefix}Editor bundle failed to load — refresh the page or restart \`pnpm dev\`.`;
    }
    return `${prefix}${msg}`;
  }
  return `${prefix}${String(err)}`;
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

async function readApiError(res: Response): Promise<never> {
  if (res.status === 401) {
    redirectToLoginAfterUnauthorized();
    throw new ApiAuthError();
  }
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as ApiErrorBody;
    message = body.error ?? body.message ?? message;
  } catch {
    // Non-JSON error body — keep status message.
  }
  if (res.status === 409) {
    throw new ApiConflictError(message);
  }
  throw new Error(message);
}

/** Authenticated fetch — throws with server error message when `!res.ok`. */
export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: mergeHeaders(init),
    });
  } catch (err) {
    throw new Error(formatApiError(err));
  }
  if (!res.ok) {
    await readApiError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Like `apiFetch` but returns `null` on 404 instead of throwing. */
export async function apiFetchOptional<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: mergeHeaders(init),
    });
  } catch (err) {
    throw new Error(formatApiError(err));
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    await readApiError(res);
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
