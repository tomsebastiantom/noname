export interface AnalyticsEvent {
  eventType: string;
  sessionId: string;
  schemaId: string | null;
  variantId: string | null;
  contextHash: string | null;
  meta: Record<string, unknown>;
  timestamp: number;
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

export interface WebVitalMetric {
  name: "LCP" | "INP" | "CLS" | "TTFB" | "FCP";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta?: number;
}

export interface AnalyticsModule {
  track(eventType: string, meta?: Record<string, unknown>): void;
  pageView(): void;
  identify(sessionId: string): void;
  setContext(schemaId: string, variantId: string, contextHash: string): void;
  flush(): Promise<void>;
}

export interface ErrorsModule {
  capture(error: Error, context?: Record<string, unknown>): void;
  breadcrumb(message: string, data?: Record<string, unknown>): void;
  setUser(user: { id: string; email?: string; name?: string }): void;
}

export interface TraceModule {
  startSpan(name: string, attributes?: Record<string, string>): SpanContext;
  getTraceHeaders(): { traceparent: string; tracestate?: string };
}

export interface PerformanceModule {
  report(callback: (metric: WebVitalMetric) => void): void;
  reportNavigation(): void;
}

export interface FlagsModule {
  get(key: string): unknown;
  onUpdate(key: string, callback: (value: unknown) => void): () => void;
  evaluate(context?: Record<string, unknown>): Promise<void>;
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
  destroy(): void;
}

export interface BrowserSDKOptions {
  tenantId: string;
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
  debug?: boolean;
}
