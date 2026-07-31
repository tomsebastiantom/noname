/** Default timeout for outbound fetches from the edge to the origin API. */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * `fetch` with an AbortController-based timeout so a slow/hanging origin
 * can't tie up a worker invocation indefinitely.
 */
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
