import type { PerformanceModule, WebVitalMetric } from "../types";

type VitalCallback = (metric: WebVitalMetric) => void;

export function createPerformanceModule(
  trackAnalytics: (eventType: string, meta?: Record<string, unknown>) => void,
  captureWebVitals: boolean,
  captureNavigationTiming: boolean,
  captureResourceTiming: boolean,
): PerformanceModule {
  const callbacks: VitalCallback[] = [];

  if (typeof window === "undefined") {
    return {
      report(cb) {
        callbacks.push(cb);
      },
      reportNavigation() {},
    };
  }

  let webVitals: typeof import("web-vitals") | null = null;

  async function loadWebVitals() {
    if (webVitals) return webVitals;
    webVitals = await import("web-vitals");
    return webVitals;
  }

  function emit(metric: WebVitalMetric) {
    trackAnalytics("web_vital", {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
    });
    for (const cb of callbacks) cb(metric);
  }

  function startObservers() {
    if (!captureWebVitals) return;

    loadWebVitals().then((v) => {
      v.onLCP((m) =>
        emit({
          name: "LCP",
          value: m.value,
          rating: m.rating as WebVitalMetric["rating"],
          delta: m.delta,
        }),
      );
      v.onINP((m) =>
        emit({
          name: "INP",
          value: m.value,
          rating: m.rating as WebVitalMetric["rating"],
          delta: m.delta,
        }),
      );
      v.onCLS((m) =>
        emit({
          name: "CLS",
          value: m.value,
          rating: m.rating as WebVitalMetric["rating"],
          delta: m.delta,
        }),
      );
      v.onTTFB((m) =>
        emit({
          name: "TTFB",
          value: m.value,
          rating: m.rating as WebVitalMetric["rating"],
          delta: m.delta,
        }),
      );
      v.onFCP((m) =>
        emit({
          name: "FCP",
          value: m.value,
          rating: m.rating as WebVitalMetric["rating"],
          delta: m.delta,
        }),
      );
    });

    if (captureNavigationTiming) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceNavigationTiming[]) {
          trackAnalytics("navigation_timing", {
            dns: entry.domainLookupEnd - entry.domainLookupStart,
            tcp: entry.connectEnd - entry.connectStart,
            ttfb: entry.responseStart - entry.requestStart,
            download: entry.responseEnd - entry.responseStart,
            domInteractive: entry.domInteractive - entry.fetchStart,
            domComplete: entry.domComplete - entry.fetchStart,
            loadComplete: entry.loadEventEnd - entry.fetchStart,
            transferSize: entry.transferSize,
            type: entry.type,
          });
        }
      });
      observer.observe({ type: "navigation", buffered: true });
    }

    if (captureResourceTiming) {
      const resourceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceResourceTiming[];
        const batch: Record<string, unknown>[] = [];
        for (const entry of entries) {
          if (entry.transferSize === 0 && entry.decodedBodySize === 0) continue;
          batch.push({
            name: entry.name,
            type: entry.initiatorType,
            duration: Math.round(entry.duration),
            dns: Math.round(entry.domainLookupEnd - entry.domainLookupStart),
            tcp: Math.round(entry.connectEnd - entry.connectStart),
            ttfb: Math.round(entry.responseStart - entry.requestStart),
            download: Math.round(entry.responseEnd - entry.responseStart),
            transferSize: entry.transferSize,
            decodedBodySize: entry.decodedBodySize,
          });
        }
        if (batch.length > 0) {
          trackAnalytics("resource_timing", { resources: batch });
        }
      });
      resourceObserver.observe({ type: "resource", buffered: true });
    }
  }

  startObservers();

  return {
    report(cb) {
      callbacks.push(cb);
    },
    reportNavigation() {
      trackAnalytics("page_view", {
        url: window.location.href,
        type: "soft_navigation",
      });
      startObservers();
    },
  };
}
