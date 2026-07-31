/** Default timeout for outbound OIDC / HTTP calls from auth helpers. */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/** Max JSON body size when reading userinfo responses (bytes). */
export const MAX_JSON_BODY_BYTES = 256 * 1024;

export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
