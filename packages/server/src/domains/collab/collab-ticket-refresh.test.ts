import { describe, expect, it, vi } from "vitest";
import {
  COLLAB_TICKET_REFRESH_MS,
  COLLAB_TICKET_TTL_MS,
  scheduleCollabTicketRefresh,
} from "./collab-ticket-refresh";

describe("collab-ticket-refresh", () => {
  it("refreshes before ticket TTL expires", () => {
    expect(COLLAB_TICKET_REFRESH_MS).toBeLessThan(COLLAB_TICKET_TTL_MS);
  });

  it("calls refresh callback after delay", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const cancel = scheduleCollabTicketRefresh(refresh);

    vi.advanceTimersByTime(COLLAB_TICKET_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    cancel();
    vi.advanceTimersByTime(COLLAB_TICKET_REFRESH_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
