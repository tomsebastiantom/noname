import { describe, expect, it, vi } from "vitest";
import {
  registerExtensionDispatcher,
  type ExtensionDeliveryJob,
} from "./extension-dispatcher";
import { PROVIDER_EVENT_RECEIVED } from "./provider-events";

function setup(opts: {
  installed?: boolean;
  backends?: Array<{ extension: string; url: string; events: string[] }>;
} = {}) {
  const handlers = new Map<string, (payload: unknown) => Promise<void>>();
  const enqueued: ExtensionDeliveryJob[] = [];
  registerExtensionDispatcher({
    subscribe: (event, handler) => {
      handlers.set(event, handler);
    },
    isExtensionInstalled: async () => opts.installed ?? true,
    backends: opts.backends ?? [
      {
        extension: "commerce",
        url: "http://backend/hook",
        events: ["stripe/checkout.session.completed"],
      },
    ],
    enqueue: async (job) => {
      enqueued.push(job);
    },
  });
  const emit = (payload: unknown) => handlers.get(PROVIDER_EVENT_RECEIVED)?.(payload);
  return { emit, enqueued };
}

const forwarded = (overrides: Record<string, unknown> = {}) => ({
  orgId: "org-1",
  integrationId: "stripe",
  connectionId: "conn-1",
  eventType: "checkout.session.completed",
  payload: { data: { object: { id: "cs_123" } } },
  ...overrides,
});

describe("registerExtensionDispatcher", () => {
  it("forwards attributed events to subscribed backends untouched", async () => {
    const { emit, enqueued } = setup();
    await emit(forwarded());
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({
      orgId: "org-1",
      extension: "commerce",
      url: "http://backend/hook",
      event: "stripe/checkout.session.completed",
    });
    expect(enqueued[0]?.payload).toEqual({ data: { object: { id: "cs_123" } } });
  });

  it("skips when extension not installed for org", async () => {
    const { emit, enqueued } = setup({ installed: false });
    await emit(forwarded());
    expect(enqueued).toHaveLength(0);
  });

  it("skips backends not subscribed to the event", async () => {
    const { emit, enqueued } = setup({
      backends: [{ extension: "commerce", url: "http://backend/hook", events: ["other/event"] }],
    });
    await emit(forwarded());
    expect(enqueued).toHaveLength(0);
  });

  it("drops malformed envelopes", async () => {
    const { emit, enqueued } = setup();
    await emit({ orgId: "org-1" });
    await emit(null);
    expect(enqueued).toHaveLength(0);
  });

  it("registers nothing without backends", async () => {
    const subscribe = vi.fn();
    registerExtensionDispatcher({
      subscribe,
      isExtensionInstalled: async () => true,
      backends: [],
    });
    expect(subscribe).not.toHaveBeenCalled();
  });
});
