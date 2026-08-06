import {
  fetchReplayChunk,
  fetchReplaySessionEvents,
  fetchReplaySessions,
  type ReplayChunkPreview,
} from "../../admin/session-replay";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export const replayActions = {
  listReplaySessions: (async (params, setState) => {
    const filter = params as { q?: string; userId?: string; userEmail?: string } | undefined;
    setState(ADMIN_STATE.replay.loading, true);
    setState(ADMIN_STATE.replay.error, null);
    setState(ADMIN_STATE.replay.selectedSessionId, null);
    setState(ADMIN_STATE.replay.chunkPreview, null);
    setState(ADMIN_STATE.replay.playerEvents, null);
    try {
      const sessions = await fetchReplaySessions(filter);
      setState(ADMIN_STATE.replay.sessions, sessions);
    } catch (err) {
      setState(ADMIN_STATE.replay.error, err instanceof Error ? err.message : String(err));
      setState(ADMIN_STATE.replay.sessions, []);
    } finally {
      setState(ADMIN_STATE.replay.loading, false);
    }
  }) satisfies CatalogActionHandler,

  loadReplayChunk: (async (params, setState) => {
    const { storageKey, sessionId } = params as { storageKey: string; sessionId?: string };
    setState(ADMIN_STATE.replay.chunkLoading, true);
    setState(ADMIN_STATE.replay.error, null);
    if (sessionId) {
      setState(ADMIN_STATE.replay.selectedSessionId, sessionId);
    }
    try {
      const events = await fetchReplayChunk(storageKey);
      const preview: ReplayChunkPreview = { storageKey, eventCount: events.length };
      setState(ADMIN_STATE.replay.chunkPreview, preview);
    } catch (err) {
      setState(ADMIN_STATE.replay.error, err instanceof Error ? err.message : String(err));
      setState(ADMIN_STATE.replay.chunkPreview, null);
    } finally {
      setState(ADMIN_STATE.replay.chunkLoading, false);
    }
  }) satisfies CatalogActionHandler,

  playReplaySession: (async (params, setState) => {
    const { sessionId, storageKeys } = params as {
      sessionId: string;
      storageKeys: string[];
    };
    setState(ADMIN_STATE.replay.playerLoading, true);
    setState(ADMIN_STATE.replay.error, null);
    setState(ADMIN_STATE.replay.selectedSessionId, sessionId);
    setState(ADMIN_STATE.replay.playerEvents, null);
    try {
      const events = await fetchReplaySessionEvents(storageKeys);
      setState(ADMIN_STATE.replay.playerEvents, events);
    } catch (err) {
      setState(ADMIN_STATE.replay.error, err instanceof Error ? err.message : String(err));
      setState(ADMIN_STATE.replay.playerEvents, null);
    } finally {
      setState(ADMIN_STATE.replay.playerLoading, false);
    }
  }) satisfies CatalogActionHandler,
};
