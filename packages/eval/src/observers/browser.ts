import axe from "axe-core";
import { type Browser, type BrowserContext, chromium } from "playwright-core";
import type { BrowserObserver, EgressProbe, PageVisit } from "../types";

/**
 * The browser observer — tier 2's only I/O surface.
 *
 * Same rule as the HTTP observer: checks never launch or drive a browser themselves. They ask this port for a
 * page visit, and the port is the single place that knows about Chromium. That keeps checks testable with a
 * fake observer and keeps the concrete runtime swappable.
 *
 * Transport: it connects to a **running** Playwright server (`playwright run-server`, which is what the
 * Kubernetes browser fleet serves). It deliberately does not launch a browser: the point of the fleet is that
 * browsers are provided, pooled and resource-limited by the platform, and an eval that spawns its own Chromium
 * would bypass exactly the thing worth testing.
 */
export function createBrowserObserver(options: {
  /** `ws://browser:3000/` in-cluster, `ws://127.0.0.1:9222/` through a port-forward. */
  wsEndpoint: string;
  /** Base URL for relative paths, e.g. `http://yogastore.localhost:5173`. */
  origin: string;
  /** Per-visit navigation timeout. */
  timeoutMs?: number;
}): BrowserObserver {
  const timeoutMs = options.timeoutMs ?? 30_000;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  async function ensureContext(): Promise<BrowserContext> {
    if (!browser) browser = await chromium.connect(options.wsEndpoint, { timeout: timeoutMs });
    if (!context) context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    return context;
  }

  return {
    async visit(path, visitOptions) {
      const pageContext = await ensureContext();
      const page = await pageContext.newPage();
      const width = visitOptions?.width ?? 1280;
      await page.setViewportSize({ width, height: 800 });
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200));
      });

      const url = /^https?:\/\//.test(path) ? path : `${options.origin.replace(/\/$/, "")}${path}`;
      let status = 0;
      let title = "";
      let bodyText = "";
      let nodesByType: Record<string, number> = {};
      let overflow: { scrollWidth: number; clientWidth: number } | undefined;
      let a11y: PageVisit["a11y"];

      try {
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: visitOptions?.timeoutMs ?? timeoutMs,
        });
        status = response?.status() ?? 0;
        // The SPA hydrates after DOMContentLoaded; without this the text is an empty shell and the check would
        // "pass" on a blank page — the exact false positive this tier exists to catch.
        await page.waitForTimeout(2500);
        title = await page.title();
        bodyText = (
          await page
            .locator("body")
            .innerText()
            .catch(() => "")
        )
          .replace(/\s+/g, " ")
          .trim();
        nodesByType = await page
          .evaluate(() => {
            const counts: Record<string, number> = {};
            for (const element of document.querySelectorAll("[data-block-type]")) {
              const type = element.getAttribute("data-block-type") ?? "";
              if (type) counts[type] = (counts[type] ?? 0) + 1;
            }
            return counts;
          })
          .catch(() => ({}));
        overflow = await page
          .evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }))
          .catch(() => undefined);

        if (visitOptions?.a11y) {
          await page.addScriptTag({ content: axe.source }).catch(() => {});
          a11y = await page
            .evaluate(async () => {
              const runner = (
                window as unknown as {
                  axe?: {
                    run: (
                      context: Document,
                      options: unknown,
                    ) => Promise<{
                      violations: Array<{
                        id: string;
                        impact?: string | null;
                        nodes: unknown[];
                      }>;
                    }>;
                  };
                }
              ).axe;
              if (!runner) return undefined;
              const result = await runner.run(document, {
                runOnly: {
                  type: "rule",
                  values: ["image-alt", "label", "button-name", "link-name"],
                },
              });
              return result.violations.map((violation) => ({
                id: violation.id,
                impact: violation.impact ?? "unknown",
                nodes: violation.nodes.length,
              }));
            })
            .catch(() => undefined);
        }
      } catch (cause) {
        bodyText = `navigation failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      } finally {
        await page.close().catch(() => {});
      }

      const visit: PageVisit = {
        url,
        status,
        title,
        width,
        overflow,
        textLength: bodyText.length,
        text: bodyText,
        sample: bodyText.slice(0, 300),
        nodesByType,
        a11y,
        consoleErrors,
      };
      return visit;
    },

    async close() {
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
      context = null;
      browser = null;
    },

    /**
     * Try to reach internal targets from a blank page. `no-cors` makes the request opaque but still tells us
     * whether the network path exists — the SSRF question S1 asks. Non-HTTP targets (Redis) cannot be probed
     * with fetch; the check documents that limit rather than pretending to cover it.
     */
    async probeEgress(targets) {
      const pageContext = await ensureContext();
      const page = await pageContext.newPage();
      try {
        return (await page.evaluate(async (urls: string[]) => {
          const results: Array<{ target: string; reachable: boolean }> = [];
          for (const target of urls) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2_000);
            try {
              await fetch(target, {
                mode: "no-cors",
                signal: controller.signal,
                cache: "no-store",
              });
              results.push({ target, reachable: true });
            } catch {
              results.push({ target, reachable: false });
            } finally {
              clearTimeout(timer);
            }
          }
          return results;
        }, targets)) as EgressProbe[];
      } finally {
        await page.close().catch(() => {});
      }
    },
  };
}
