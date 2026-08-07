const HEARTBEAT_MS = 5 * 60_000;

type FanoutCheck = () => boolean;

const fanouts = new Map<string, FanoutCheck>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Registers a Redis-backed fan-out subsystem (event bus, SSE, collab relay, ...) so its
 * degraded/active state is visible in `/health` and logged periodically while degraded —
 * without this, a Redis outage silently drops these systems to single-instance mode with no
 * signal for anyone to notice until a multi-replica bug report comes in.
 */
export function registerRedisFanout(name: string, isActive: FanoutCheck): void {
  fanouts.set(name, isActive);
}

export function getRedisFanoutStatus(): { degraded: boolean; subsystems: Record<string, boolean> } {
  const subsystems: Record<string, boolean> = {};
  let degraded = false;
  for (const [name, isActive] of fanouts) {
    const active = isActive();
    subsystems[name] = active;
    if (!active) degraded = true;
  }
  return { degraded, subsystems };
}

/** Logs at ERROR level on a fixed interval while any registered fan-out is degraded — a one-time
 * log at the moment of failure scrolls out of most log retention windows long before anyone
 * looks; a periodic repeat while the condition persists is what most log-based alerting rules
 * (e.g. "N occurrences of this message in 5 minutes") actually key off. No-op once all subsystems
 * are healthy again. */
export function startRedisFanoutMonitor(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    const { degraded, subsystems } = getRedisFanoutStatus();
    if (!degraded) return;
    const down = Object.entries(subsystems)
      .filter(([, active]) => !active)
      .map(([name]) => name);
    console.error(
      `[redis-fanout] degraded to single-instance mode: ${down.join(", ")} — cross-replica sync/broadcast is not happening for these subsystems until Redis connectivity is restored and the process is redeployed`,
    );
  }, HEARTBEAT_MS);
}

/** Test-only: stop the interval and clear registrations between test files. */
export function resetRedisFanoutStatusForTests(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  fanouts.clear();
}
