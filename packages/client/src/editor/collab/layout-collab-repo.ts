import { type PeerId, Repo } from "@automerge/automerge-repo/slim";
import { createAutomergeIndexedDbStorage } from "../../platform/persistence";

let sharedRepo: Repo | null = null;

/**
 * One long-lived repo per page for layout collaboration. Collab sessions attach
 * and detach WebSocket adapters on this repo instead of creating a Repo per
 * connection: Repo.shutdown() flushes every cached handle and throws
 * "DocHandle is not ready" when a handle is still loading, so per-session
 * shutdown reintroduced that race on every reconnect.
 */
export function getLayoutCollabRepo(): Repo {
  if (sharedRepo) return sharedRepo;
  const repo = new Repo({
    storage: createAutomergeIndexedDbStorage("layout-collab"),
    peerId: `layout-client-${crypto.randomUUID()}` as PeerId,
  });
  // Changes are persisted by debounced saves (~100ms); this is a best-effort
  // catch-up when the page goes away. Worst case on failure is losing the last
  // debounce window, so errors are ignored.
  window.addEventListener("pagehide", () => {
    void repo.flush().catch(() => {});
  });
  sharedRepo = repo;
  return repo;
}
