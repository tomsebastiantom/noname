import { apiFetchData } from "../../lib/api";
import { collabHumanDisplayName } from "./collab-display-name";

export async function mintLayoutCollabTicket(
  layoutDocumentId: string,
): Promise<{ ticket: string; expiresIn: number }> {
  return apiFetchData<{ ticket: string; expiresIn: number }>("/api/collab/layout/ticket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      layoutDocumentId,
      displayName: collabHumanDisplayName(),
    }),
  });
}

export async function mintRichTextCollabTicket(input: {
  contentDocumentId: string;
  fieldKey: string;
  locale: string;
}): Promise<{ ticket: string; expiresIn: number; roomName: string }> {
  return apiFetchData<{ ticket: string; expiresIn: number; roomName: string }>(
    "/api/collab/richtext/ticket",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

/** Same origin as the page — edge worker proxies WS upgrade to API (dev + prod). */
export function layoutCollabWsUrl(ticket: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/collab/layout/ws?collab_ticket=${encodeURIComponent(ticket)}`;
}

export function richTextCollabWsBaseUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/collab/richtext/ws`;
}
