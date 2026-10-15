import { createRedisFanout, type RedisFanout } from "../../shared/redis-fanout";

const CHANNEL = "noname:collab-relay";

/** One id per process — lets a replica ignore its own publishes echoed back by Redis pub/sub. */
const REPLICA_ID = crypto.randomUUID();

type RelayEnvelope = {
  kind: string;
  roomName: string;
  senderId: string;
  data: string; // base64-encoded binary room message (Yjs update, Automerge snapshot, ...)
};

type RelayHandler = (msg: { roomName: string; data: Uint8Array }) => void;

let fanout: RedisFanout | null = null;
let initialized = false;
const handlersByKind = new Map<string, RelayHandler[]>();

function dispatchLocal(kind: string, roomName: string, data: Uint8Array): void {
  for (const handler of handlersByKind.get(kind) ?? []) {
    handler({ roomName, data });
  }
}

/**
 * Cross-replica fan-out for live collab room state (Yjs rich-text updates, Automerge layout
 * snapshots). Same silent-degrade-to-single-instance pattern as `event-bus.ts`/`sse-manager.ts`:
 * without Redis this is a no-op and every collab room stays local-only, exactly like today.
 */
export function initCollabRedisRelay(): void {
  if (initialized) return;
  initialized = true;

  fanout = createRedisFanout({
    name: "collab-relay",
    channel: CHANNEL,
    consequence: "collab rooms won't sync across replicas",
    onMessage: (raw) => {
      let msg: RelayEnvelope;
      try {
        msg = JSON.parse(raw) as RelayEnvelope;
      } catch {
        return; // not a message of ours; nothing to do
      }
      if (msg.senderId === REPLICA_ID) return; // our own publish, echoed back by Redis
      if (!msg.kind || !msg.roomName || typeof msg.data !== "string") return;
      dispatchLocal(msg.kind, msg.roomName, new Uint8Array(Buffer.from(msg.data, "base64")));
    },
  });
}

/** Register a handler for relayed messages of one room kind (e.g. `"richtext-doc"`, `"layout-snapshot"`). */
export function onCollabRelayMessage(kind: string, handler: RelayHandler): void {
  const existing = handlersByKind.get(kind) ?? [];
  existing.push(handler);
  handlersByKind.set(kind, existing);
}

/** Publish a binary room message to every other replica. Silent no-op without Redis. */
export function publishCollabRelay(kind: string, roomName: string, data: Uint8Array): void {
  if (!fanout?.isActive()) return;
  const envelope: RelayEnvelope = {
    kind,
    roomName,
    senderId: REPLICA_ID,
    data: Buffer.from(data).toString("base64"),
  };
  void fanout.publish(envelope);
}

export function isCollabRelayActive(): boolean {
  return fanout?.isActive() ?? false;
}

/** Test-only: reset module state between test files (each test constructs its own Redis mocks). */
export function resetCollabRelayForTests(): void {
  initialized = false;
  fanout = null;
  handlersByKind.clear();
}
