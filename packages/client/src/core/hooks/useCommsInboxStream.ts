import { useEffect, useRef } from "react";
import { apiFetchData } from "../../lib/api";
import { getAccessToken, hydrateTokenFromCookie, sessionUserId } from "../../auth/session";

/** Live inbox refresh via SSE (`GET /api/notifications/stream`). Falls back to caller polling if no token. */
export function useCommsInboxStream(onInboxEvent: () => void, enabled = true): void {
  const callbackRef = useRef(onInboxEvent);
  callbackRef.current = onInboxEvent;

  useEffect(() => {
    if (!enabled) return;

    hydrateTokenFromCookie();
    const token = getAccessToken();
    const userId = sessionUserId();
    if (!token || !userId) return;

    let source: EventSource | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const ticket = await apiFetchData<{ ticket: string; expiresIn: number }>(
          "/api/notifications/stream/ticket",
          { method: "POST" },
        );
        if (cancelled) return;
        const url = `/api/notifications/stream?stream_ticket=${encodeURIComponent(ticket.ticket)}`;
        source = new EventSource(url);
      } catch {
        if (cancelled) return;
        const url = `/api/notifications/stream?access_token=${encodeURIComponent(token)}`;
        source = new EventSource(url);
      }

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; userId?: string };
          if (payload.type === "comms.inbox" && payload.userId === userId) {
            callbackRef.current();
          }
        } catch {
          // Ignore malformed SSE payloads.
        }
      };
    })();

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [enabled]);
}
