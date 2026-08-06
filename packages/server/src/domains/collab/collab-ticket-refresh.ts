/** Refresh collab tickets before the 60s TTL expires (matches collab-ticket.ts). */
export const COLLAB_TICKET_TTL_MS = 60_000;
export const COLLAB_TICKET_REFRESH_MS = 45_000;

export function scheduleCollabTicketRefresh(onRefresh: () => void | Promise<void>): () => void {
  const timer = setTimeout(() => {
    void onRefresh();
  }, COLLAB_TICKET_REFRESH_MS);
  return () => clearTimeout(timer);
}
