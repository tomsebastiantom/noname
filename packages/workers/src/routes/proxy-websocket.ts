/** WebSocket upgrade passthrough to API origin (collab, future WS routes). */

const WS_REQUEST_HEADERS = [
  "upgrade",
  "connection",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-protocol",
  "sec-websocket-extensions",
] as const;

export function isWebSocketUpgrade(headerValue: string | undefined): boolean {
  return headerValue?.toLowerCase() === "websocket";
}

export function isCollabLayoutWsWithTicket(url: URL): boolean {
  return url.pathname === "/api/collab/layout/ws" && url.searchParams.has("collab_ticket");
}

export function isCollabRichTextWsWithTicket(url: URL): boolean {
  return (
    url.pathname.startsWith("/api/collab/richtext/ws/") && url.searchParams.has("collab_ticket")
  );
}

export function isCollabWsWithTicket(url: URL): boolean {
  return isCollabLayoutWsWithTicket(url) || isCollabRichTextWsWithTicket(url);
}

export function appendWebSocketRequestHeaders(from: Headers, to: Headers): void {
  for (const name of WS_REQUEST_HEADERS) {
    const value = from.get(name);
    if (value) {
      to.set(name, value);
    }
  }
}

/** Proxy WS upgrade to Node API — do not use fetchWithTimeout (long-lived). */
export async function proxyWebSocketToOrigin(
  targetUrl: string,
  incomingHeaders: Headers,
  signedHeaders: Record<string, string>,
): Promise<Response> {
  const headers = new Headers();
  appendWebSocketRequestHeaders(incomingHeaders, headers);
  for (const [key, value] of Object.entries(signedHeaders)) {
    headers.set(key, value);
  }

  return fetch(targetUrl, {
    method: "GET",
    headers,
  });
}
