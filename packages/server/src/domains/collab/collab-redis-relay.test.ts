import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal fake Redis: every instance shares one in-memory channel map so `publish()` on one
// instance delivers to `on("message", ...)` listeners registered on every other instance —
// the same fan-out shape real Redis pub/sub provides across separate connections.
const channels = new Map<string, Set<FakeRedis>>();

class FakeRedis extends EventEmitter {
  async subscribe(channel: string): Promise<void> {
    const subs = channels.get(channel) ?? new Set();
    subs.add(this);
    channels.set(channel, subs);
  }

  async publish(channel: string, message: string): Promise<number> {
    const subs = channels.get(channel) ?? new Set();
    for (const sub of subs) {
      sub.emit("message", channel, message);
    }
    return subs.size;
  }
}

vi.mock("ioredis", () => ({ default: FakeRedis }));

describe("collab-redis-relay", () => {
  beforeEach(() => {
    channels.clear();
    vi.resetModules();
  });

  afterEach(() => {
    channels.clear();
  });

  it("delivers a published message to a handler registered for the same kind", async () => {
    const { initCollabRedisRelay, onCollabRelayMessage, isCollabRelayActive } = await import(
      "./collab-redis-relay"
    );

    initCollabRedisRelay();
    expect(isCollabRelayActive()).toBe(true);

    const received: Array<{ roomName: string; data: Uint8Array }> = [];
    onCollabRelayMessage("richtext-doc", (msg) => received.push(msg));

    // Redis delivers a publish to every subscriber on the channel, including the publisher's own
    // subscriber connection — the module must not self-deliver its own publish as if it came from
    // another replica. Simulate that by publishing from a *second* fake connection representing
    // another replica process, and confirm this replica's subscriber still receives it correctly.
    const other = new FakeRedis();
    await other.subscribe("noname:collab-relay");
    const payload = new Uint8Array([1, 2, 3]);
    await other.publish(
      "noname:collab-relay",
      JSON.stringify({
        kind: "richtext-doc",
        roomName: "org1:doc1:body:en-US",
        senderId: "other-replica",
        data: Buffer.from(payload).toString("base64"),
      }),
    );

    expect(received).toHaveLength(1);
    expect(received[0].roomName).toBe("org1:doc1:body:en-US");
    expect(Array.from(received[0].data)).toEqual([1, 2, 3]);
  });

  it("does not deliver a message this replica published itself (self-echo)", async () => {
    const { initCollabRedisRelay, onCollabRelayMessage, publishCollabRelay } = await import(
      "./collab-redis-relay"
    );

    initCollabRedisRelay();
    const received: unknown[] = [];
    onCollabRelayMessage("layout-snapshot", (msg) => received.push(msg));

    publishCollabRelay("layout-snapshot", "org1:layout1", new Uint8Array([9, 9, 9]));

    expect(received).toHaveLength(0);
  });

  it("ignores messages for a different relay kind", async () => {
    const { initCollabRedisRelay, onCollabRelayMessage } = await import("./collab-redis-relay");
    initCollabRedisRelay();

    const received: unknown[] = [];
    onCollabRelayMessage("richtext-doc", (msg) => received.push(msg));

    const other = new FakeRedis();
    await other.subscribe("noname:collab-relay");
    await other.publish(
      "noname:collab-relay",
      JSON.stringify({
        kind: "layout-snapshot",
        roomName: "org1:layout1",
        senderId: "other-replica",
        data: Buffer.from(new Uint8Array([1])).toString("base64"),
      }),
    );

    expect(received).toHaveLength(0);
  });

  it("is inactive (no publisher) when Redis construction throws", async () => {
    vi.doMock("ioredis", () => ({
      default: class {
        constructor() {
          throw new Error("connection refused");
        }
      },
    }));
    const { initCollabRedisRelay, isCollabRelayActive, publishCollabRelay } = await import(
      "./collab-redis-relay"
    );

    initCollabRedisRelay();
    expect(isCollabRelayActive()).toBe(false);
    expect(() =>
      publishCollabRelay("richtext-doc", "org1:doc1:body:en-US", new Uint8Array()),
    ).not.toThrow();
  });
});
