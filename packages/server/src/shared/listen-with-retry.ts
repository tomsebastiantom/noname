/**
 * Bind a listening server, retrying while the port is still held.
 *
 * Motivation: a restart can overlap the previous process's drain, so the port may
 * be busy for a moment. Dying on EADDRINUSE leaves nothing listening while the
 * supervisor still believes the service is up — the failure mode that made a
 * `tsx watch` reload take the whole local API down.
 *
 * Kept transport-agnostic and injectable so the retry policy is unit-testable
 * (a second process cannot reliably reproduce the conflict on Windows, where two
 * Node sockets may both bind the same port).
 */

export interface ListenableServer {
  once(event: "listening", listener: () => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  close(callback?: () => void): unknown;
}

export interface ListenWithRetryOptions<T extends ListenableServer> {
  createServer: () => T;
  /** Total bind attempts, including the first. */
  attempts: number;
  /** Wait between attempts. */
  delayMs: number;
  onRetry?: (attempt: number, error: NodeJS.ErrnoException) => void;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

function isAddressInUse(error: Error): boolean {
  return (error as NodeJS.ErrnoException).code === "EADDRINUSE";
}

export async function listenWithRetry<T extends ListenableServer>(
  options: ListenWithRetryOptions<T>,
): Promise<T> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const attempts = Math.max(1, options.attempts);

  for (let attempt = 1; ; attempt += 1) {
    const candidate = options.createServer();
    const outcome = await new Promise<
      { kind: "listening"; server: T } | { kind: "error"; error: Error }
    >((resolve) => {
      candidate.once("listening", () => resolve({ kind: "listening", server: candidate }));
      candidate.once("error", (error: Error) => resolve({ kind: "error", error }));
    });

    if (outcome.kind === "listening") return outcome.server;

    candidate.close();
    const busy = isAddressInUse(outcome.error);

    if (busy && attempt < attempts) {
      options.onRetry?.(attempt, outcome.error as NodeJS.ErrnoException);
      await sleep(options.delayMs);
      continue;
    }

    // A non-EADDRINUSE error is never worth retrying, and an exhausted retry
    // budget means something else genuinely owns the port: surface it.
    throw outcome.error;
  }
}
