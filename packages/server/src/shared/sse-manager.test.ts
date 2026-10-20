import type { SSEStreamingApi } from "hono/streaming";
import { afterEach, describe, expect, it } from "vitest";
import {
  broadcast,
  flagsTopic,
  getClientCount,
  subscribe,
  unsubscribe,
  userTopic,
} from "./sse-manager";

/**
 * S14 — SSE audience leakage.
 *
 * Delivery is topic-addressed (Socket.IO rooms / Mercure topics): the recipient is decided by what the
 * connection *subscribed to*, not by a predicate over the payload. The previous design broadcast per-org
 * and filtered on a `userId` field, and the check only skipped entries that *had* a userId — so the
 * anonymous storefront stream (empty userId in its ticket) received other users' inbox notifications.
 *
 * These tests assert the structural property: a connection subscribed to `flagsTopic` is not a
 * candidate for `userTopic`, whatever the payload says.
 */

function fakeStream(): { stream: SSEStreamingApi; writes: () => string[] } {
  const written: string[] = [];
  const stream = {
    writeSSE: (message: { data: string }) => {
      written.push(message.data);
      return Promise.resolve();
    },
    onAbort: () => undefined,
  } as unknown as SSEStreamingApi;
  return { stream, writes: () => written };
}

const registered: { topic: string; streamId: string }[] = [];

function connect(topic: string) {
  const { stream, writes } = fakeStream();
  registered.push({ topic, streamId: subscribe(topic, stream) });
  return writes;
}

afterEach(() => {
  for (const entry of registered.splice(0)) {
    unsubscribe(entry.topic, entry.streamId);
  }
});

describe("SSE topic isolation", () => {
  it("never delivers a user notification to the anonymous storefront stream", () => {
    // The reported leak. Fan-out is inactive in tests, so `broadcast` delivers locally.
    const storefront = connect(flagsTopic("org-1"));

    broadcast(userTopic("org-1", "user-alice"), {
      type: "comms.inbox",
      userId: "user-alice",
      item: { title: "Your order shipped", body: "Tracking 1234" },
    });

    expect(storefront()).toHaveLength(0);
  });

  it("delivers a user notification only to that user's topic, even if the payload claims another", () => {
    const alice = connect(userTopic("org-1", "user-alice"));
    const bob = connect(userTopic("org-1", "user-bob"));

    broadcast(userTopic("org-1", "user-alice"), { type: "comms.inbox", userId: "user-bob" });

    // Routing ignores the payload's userId entirely: alice subscribed, so alice receives.
    expect(alice()).toHaveLength(1);
    expect(bob()).toHaveLength(0);
  });

  it("delivers to every tab a user has open", () => {
    const tabOne = connect(userTopic("org-1", "user-alice"));
    const tabTwo = connect(userTopic("org-1", "user-alice"));

    broadcast(userTopic("org-1", "user-alice"), { type: "comms.inbox" });

    expect(tabOne()).toHaveLength(1);
    expect(tabTwo()).toHaveLength(1);
  });

  it("delivers org-wide flag changes to every storefront subscriber of that org", () => {
    const first = connect(flagsTopic("org-1"));
    const second = connect(flagsTopic("org-1"));

    broadcast(flagsTopic("org-1"), { key: "summer_sale" });

    expect(first()).toHaveLength(1);
    expect(second()).toHaveLength(1);
  });

  it("scopes users by org, so the same user id cannot cross tenants", () => {
    const inOrgA = connect(userTopic("org-a", "user-alice"));

    broadcast(userTopic("org-b", "user-alice"), { type: "comms.inbox" });

    expect(inOrgA()).toHaveLength(0);
  });

  it("does not deliver a flag change to a user's notification stream", () => {
    const notifications = connect(userTopic("org-1", "user-alice"));

    broadcast(flagsTopic("org-1"), { key: "summer_sale" });

    expect(notifications()).toHaveLength(0);
  });
});

describe("SSE client accounting", () => {
  it("counts per topic and in total", () => {
    connect(flagsTopic("org-count"));
    connect(flagsTopic("org-count"));
    connect(userTopic("org-count", "user-alice"));

    expect(getClientCount(flagsTopic("org-count"))).toBe(2);
    expect(getClientCount(userTopic("org-count", "user-alice"))).toBe(1);
    expect(getClientCount()).toBe(3);
  });
});
