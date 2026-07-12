import { setDebug } from "./core/logger";
import { isBot, respectDNT } from "./core/privacy";
import { getOrCreateSession } from "./core/session";
import { createAnalyticsModule } from "./modules/analytics";
import { createErrorsModule } from "./modules/errors";
import { createFlagsModule } from "./modules/flags";
import { createPerformanceModule } from "./modules/performance";
import { createReplayModule } from "./modules/replay";
import { createTraceModule, getCurrentTraceContext } from "./modules/trace";
import type { BrowserSDK, BrowserSDKOptions } from "./types";

const DEFAULT_ANALYTICS_ENDPOINT = "/api/analytics/track";
const DEFAULT_ERRORS_ENDPOINT = "/api/analytics/error";
const DEFAULT_FLAGS_ENDPOINT = "/api/flags/evaluate";
const DEFAULT_REPLAY_ENDPOINT = "/api/analytics/replay";

export async function init(options: BrowserSDKOptions): Promise<BrowserSDK> {
  if (typeof window === "undefined") {
    throw new Error("browser-sdk: init() can only be called in a browser environment");
  }

  setDebug(options.debug ?? false);

  if (isBot()) {
    throw new Error("browser-sdk: bot detected, refusing to initialize");
  }

  if (options.privacy?.respectDNT !== false && respectDNT()) {
    throw new Error("browser-sdk: DNT/GPC signal detected, refusing to initialize");
  }

  const session = getOrCreateSession();

  let schemaId: string | null = null;
  let variantId: string | null = null;
  let contextHash: string | null = null;

  const getAnalyticsContext = () => ({
    sessionId: session.id,
    schemaId,
    variantId,
    contextHash,
  });

  const trace = createTraceModule({
    enabled: options.trace?.enabled ?? true,
    serviceName: options.trace?.serviceName,
    propagateFetch: options.trace?.propagateFetch,
  });

  const analytics = createAnalyticsModule(
    options.analytics?.endpoint ?? DEFAULT_ANALYTICS_ENDPOINT,
    getAnalyticsContext,
    options.analytics?.batchSize,
    options.analytics?.flushIntervalMs,
  );

  const errors = createErrorsModule(
    options.errors?.endpoint ?? DEFAULT_ERRORS_ENDPOINT,
    () => session.id,
    () => getCurrentTraceContext(),
    options.errors?.dedupWindowMs,
    options.errors?.captureConsoleError ?? true,
  );

  const performance = createPerformanceModule(
    (eventType, meta) => analytics.track(eventType, meta),
    options.performance?.captureWebVitals ?? true,
    options.performance?.captureNavigationTiming ?? true,
    options.performance?.captureResourceTiming ?? true,
  );

  const flags = createFlagsModule(
    options.flags?.endpoint ?? DEFAULT_FLAGS_ENDPOINT,
    options.tenantId,
    () => ({
      contextHash: contextHash ?? "",
      schemaId,
      variantId,
      contextProperties: {},
    }),
  );

  const replay = await createReplayModule(
    options.replay?.endpoint ?? DEFAULT_REPLAY_ENDPOINT,
    session.id,
    options.replay?.sampleRate ?? 0.05,
    options.replay?.maskAllInputs ?? true,
    options.replay?.maxDurationMs ?? 600_000,
  );

  const sdk: BrowserSDK = {
    analytics: {
      track: analytics.track.bind(analytics),
      pageView: analytics.pageView.bind(analytics),
      identify(id: string) {
        session.id = id;
      },
      setContext(sId, vId, cHash) {
        schemaId = sId;
        variantId = vId;
        contextHash = cHash;
      },
      flush: analytics.flush.bind(analytics),
    },
    errors: {
      capture: errors.capture.bind(errors),
      breadcrumb: errors.breadcrumb.bind(errors),
      setUser: errors.setUser.bind(errors),
    },
    trace: {
      startSpan: trace.startSpan.bind(trace),
      getTraceHeaders: trace.getTraceHeaders.bind(trace),
    },
    performance: {
      report: performance.report.bind(performance),
      reportNavigation: performance.reportNavigation.bind(performance),
    },
    flags: {
      get: flags.get.bind(flags),
      onUpdate: flags.onUpdate.bind(flags),
      evaluate: flags.evaluate.bind(flags),
      isReady: flags.isReady.bind(flags),
    },
    replay: {
      start: replay.start.bind(replay),
      stop: replay.stop.bind(replay),
      mask: replay.mask.bind(replay),
      unmask: replay.unmask.bind(replay),
      getSessionId: replay.getSessionId.bind(replay),
    },
    destroy() {
      // No persistent cleanup needed — sessionStorage is auto-cleaned
      // Event listeners are window-scoped and die with the page
    },
  };

  return sdk;
}

export type { BrowserSDK, BrowserSDKOptions } from "./types";
