export interface BatcherOptions {
  batchSize?: number;
  flushIntervalMs?: number;
}

export class Batcher<T> {
  private buffer: T[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private onFlush: (batch: T[]) => Promise<void>;
  private batchSize: number;
  private flushIntervalMs: number;

  constructor(onFlush: (batch: T[]) => Promise<void>, options: BatcherOptions = {}) {
    this.onFlush = onFlush;
    this.batchSize = options.batchSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
  }

  push(item: T): void {
    this.buffer.push(item);

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const batch = this.buffer;
    this.buffer = [];

    try {
      await this.onFlush(batch);
    } catch {
      // Drop on failure — analytics is best-effort
    } finally {
      this.flushing = false;
    }
  }

  drainForBeacon(): T[] {
    const batch = this.buffer;
    this.buffer = [];
    return batch;
  }

  get size(): number {
    return this.buffer.length;
  }
}

export function sendWithRetry(
  url: string,
  body: string,
  maxRetries: number = 1,
  headers: Record<string, string> = {},
): Promise<void> {
  return attempt(url, body, 0, maxRetries, headers);
}

async function attempt(
  url: string,
  body: string,
  n: number,
  max: number,
  headers: Record<string, string>,
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
      keepalive: true,
    });
    if (!res.ok && n < max) {
      await attempt(url, body, n + 1, max, headers);
    }
  } catch {
    if (n < max) {
      await attempt(url, body, n + 1, max, headers);
    }
  }
}

export function sendBeacon(url: string, body: string): void {
  try {
    navigator.sendBeacon(url, body);
  } catch {
    // sendBeacon failed — acceptable loss for analytics
  }
}
