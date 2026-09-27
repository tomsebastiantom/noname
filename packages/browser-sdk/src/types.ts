export interface AnalyticsAttributionContext {
  schemaId: string | null;
  variantId: string | null;
  audienceKey: string | null;
  audienceDefinitionVersion: number | null;
  bindingId: string | null;
  bindingVersion: number | null;
  decisionId: string | null;
  pageKey: string | null;
  locale: string | null;
}

export interface AnalyticsEvent extends AnalyticsAttributionContext {
  eventType: string;
  sessionId: string;
  meta: Record<string, unknown>;
  timestamp: number;
}

/** Client-supplied rollout context is never authoritative; the server re-derives identity/audiences. */
export interface FlagEvaluationClientContext {
  subject?: { kind: "session"; key: string };
  schemaId?: string | null;
  variantId?: string | null;
  contextProperties?: Record<string, string | number | boolean>;
}

export interface ErrorReport {
  errorId: string;
  sessionId: string;
  traceId: string;
  spanId: string;
  timestamp: number;
  message: string;
  stack: string;
  type: "unhandled" | "unhandledrejection" | "console" | "manual";
  breadcrumbs: Array<{ message: string; data?: Record<string, unknown>; timestamp: number }>;
  url: string;
  userAgent: string;
  user?: { id: string; email?: string; name?: string };
  tags: Record<string, string>;
  count: number;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  end: () => void;
  setAttribute: (key: string, value: string) => void;
}

/** Finished browser span exported to the server OTLP proxy. */
export interface BrowserSpanExport {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeMs: number;
  durationMs: number;
  attributes?: Record<string, string>;
  status?: "ok" | "error";
}

export interface WebVitalMetric {
  name: "LCP" | "INP" | "CLS" | "TTFB" | "FCP";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta?: number;
}

export interface ObservabilityUser {
  id: string;
  email?: string;
  name?: string;
}

export interface AnalyticsModule {
  track(eventType: string, meta?: Record<string, unknown>): void;
  pageView(): void;
  identify(sessionId: string): void;
  setContext(context: AnalyticsAttributionContext): void;
  flush(): Promise<void>;
}

export interface ErrorsModule {
  capture(error: Error, context?: Record<string, unknown>): void;
  breadcrumb(message: string, data?: Record<string, unknown>): void;
  setUser(user: ObservabilityUser | null): void;
}

export interface TraceModule {
  startSpan(name: string, attributes?: Record<string, string>): SpanContext;
  getTraceHeaders(): { traceparent: string; tracestate?: string };
  flush(): Promise<void>;
}

export interface PerformanceModule {
  report(callback: (metric: WebVitalMetric) => void): void;
  reportNavigation(): void;
}

export interface FlagsModule {
  get(key: string): unknown;
  getAll(): Record<string, unknown>;
  seed(values: Record<string, unknown>): void;
  onUpdate(key: string, callback: (value: unknown) => void): () => void;
  onAnyUpdate(callback: (key: string, value: unknown) => void): () => void;
  evaluate(context?: FlagEvaluationClientContext): Promise<void>;
  isReady(): boolean;
}

export interface ReplayModule {
  start(): void;
  stop(): void;
  mask(selector: string): void;
  unmask(selector: string): void;
  getSessionId(): string;
}

export interface BrowserSDK {
  analytics: AnalyticsModule;
  errors: ErrorsModule;
  trace: TraceModule;
  performance: PerformanceModule;
  flags: FlagsModule;
  replay: ReplayModule;
  /** Attach auth account to subsequent events + errors. Emits `user_identified` once. */
  setUser(user: ObservabilityUser): void;
  /** Clear account attribution (logout). */
  clearUser(): void;
  destroy(): void;
}

export interface BrowserSDKOptions {
  analytics?: {
    enabled?: boolean;
    endpoint?: string;
    batchSize?: number;
    flushIntervalMs?: number;
  };
  errors?: {
    enabled?: boolean;
    captureConsoleError?: boolean;
    breadcrumbsEnabled?: boolean;
    dedupWindowMs?: number;
    endpoint?: string;
  };
  trace?: {
    enabled?: boolean;
    serviceName?: string;
    propagateFetch?: boolean;
    exportSpans?: boolean;
    sampleRate?: number;
    endpoint?: string;
    batchSize?: number;
    flushIntervalMs?: number;
  };
  performance?: {
    enabled?: boolean;
    captureWebVitals?: boolean;
    captureNavigationTiming?: boolean;
    captureResourceTiming?: boolean;
  };
  flags?: {
    enabled?: boolean;
    endpoint?: string;
  };
  replay?: {
    enabled?: boolean;
    sampleRate?: number;
    maskAllInputs?: boolean;
    maxDurationMs?: number;
    endpoint?: string;
  };
  privacy?: {
    respectDNT?: boolean;
    respectGPC?: boolean;
  };
  /** Merged into SDK fetch calls (e.g. x-org-id, Authorization). sendBeacon uses edge Host org only. */
  getHeaders?: () => Record<string, string>;
  debug?: boolean;
}
