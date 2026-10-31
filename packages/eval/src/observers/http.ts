import type { EvalClient } from "../types";

/**
 * The one HTTP observer.
 *
 * Every check goes through this and nothing else, so a check can never reach a database or a browser
 * behind the caller's back. That is the boundary rule from the RFC review: the manifest observer must
 * consume the API (or a port), never a storage adapter — otherwise the eval package becomes a second
 * data-access path, which is exactly the boundary debt the 2026-10-10 audit catalogued.
 */
export function createHttpClient(options: {
  apiBase: string;
  headers: Record<string, string>;
}): EvalClient {
  const base = options.apiBase.replace(/\/$/, "");

  return {
    async getJson<T>(path: string) {
      const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
      try {
        const response = await fetch(url, { headers: options.headers });
        if (!response.ok) {
          return { ok: false as const, status: response.status, error: `HTTP ${response.status}` };
        }
        return { ok: true as const, data: (await response.json()) as T };
      } catch (cause) {
        return {
          ok: false as const,
          status: 0,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
  };
}
