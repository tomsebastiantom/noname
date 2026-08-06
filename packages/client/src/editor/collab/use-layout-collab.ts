import {
  type AnyDocumentId,
  type DocHandle,
  interpretAsDocumentId,
  type PeerId,
  Repo,
} from "@automerge/automerge-repo/slim";
import type { Spec } from "@json-render/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { sessionUserId } from "../../auth/session";
import { createAutomergeIndexedDbStorage } from "../../platform/persistence";
import { type AutomergeSpecDoc, applyLocalSpecToDraft } from "./automerge-spec";
import { awaitCollabDocHandle } from "./await-collab-doc-handle";
import { layoutCollabWsUrl, mintLayoutCollabTicket } from "./collab-api";
import { collabHumanDisplayName } from "./collab-display-name";
import type { LayoutAgentActivity } from "./collab-peer-display";
import { LayoutCollabWsAdapter } from "./layout-collab-ws-adapter";
import {
  type CollabPeerPresence,
  type CollabPresenceUpdate,
  parseCollabAgentTaskServerMessage,
  parseCollabPresenceServerMessage,
  remoteCollabPeers,
  serializeCollabPresenceClientMessage,
} from "./presence";

const RECONNECT_DELAYS_MS = [500, 1_500, 4_000] as const;
const POST_CONNECT_SYNC_MS = 400;

function specJson(spec: Spec): string {
  return JSON.stringify(spec);
}

function applySpecToHandle(handle: DocHandle<Spec>, prev: Spec | null, next: Spec): void {
  handle.change((draft) => {
    applyLocalSpecToDraft(draft as unknown as AutomergeSpecDoc, prev, next);
  });
}

/** automerge-repo has no whenSynced(); wait briefly for first peer merge after WS ready. */
async function waitForPostConnectSync(handle: DocHandle<Spec>): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      handle.off("change", onUpdate);
      handle.off("heads-changed", onUpdate);
      clearTimeout(timer);
      resolve();
    };
    const onUpdate = () => done();
    const timer = setTimeout(done, POST_CONNECT_SYNC_MS);
    handle.on("change", onUpdate);
    handle.on("heads-changed", onUpdate);
  });
}

export function useLayoutCollab({
  enabled,
  layoutDocumentId,
  initialSpec,
  onRemoteSpec,
}: {
  enabled: boolean;
  layoutDocumentId: string | null;
  initialSpec: Spec | null;
  onRemoteSpec: (next: Spec) => void;
}) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfPeerId, setSelfPeerId] = useState<string | null>(null);
  const [peers, setPeers] = useState<CollabPeerPresence[]>([]);
  const [agentTaskActivity, setAgentTaskActivity] = useState<LayoutAgentActivity | null>(null);
  const handleRef = useRef<DocHandle<Spec> | null>(null);
  const adapterRef = useRef<LayoutCollabWsAdapter | null>(null);
  const repoRef = useRef<Repo | null>(null);
  const lastSpecRef = useRef<Spec | null>(null);
  const pendingLocalSpecRef = useRef<Spec | null>(null);
  const applyingRemoteRef = useRef(false);
  const applyingLocalRef = useRef(false);
  const lastPresenceRef = useRef<CollabPresenceUpdate>({
    selectedElementId: null,
    cursorX: null,
    cursorY: null,
  });
  const onRemoteSpecRef = useRef(onRemoteSpec);
  const initialSpecRef = useRef(initialSpec);
  onRemoteSpecRef.current = onRemoteSpec;
  initialSpecRef.current = initialSpec;

  useEffect(() => {
    if (!enabled || !layoutDocumentId || !initialSpecRef.current) {
      setConnected(false);
      setSelfPeerId(null);
      setPeers([]);
      setAgentTaskActivity(null);
      pendingLocalSpecRef.current = null;
      return;
    }

    let cancelled = false;
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let sentJoinPresence = false;
    lastSpecRef.current = initialSpecRef.current;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delayMs =
        RECONNECT_DELAYS_MS.at(Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)) ??
        RECONNECT_DELAYS_MS.at(-1)!;
      reconnectAttempt += 1;
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connectSession();
      }, delayMs);
    };

    const teardownSession = async () => {
      handleRef.current = null;
      const repo = repoRef.current;
      const adapter = adapterRef.current;
      repoRef.current = null;
      adapterRef.current = null;
      if (repo) {
        await repo.shutdown();
      }
      adapter?.disconnect();
    };

    const sendJoinPresence = (adapter: LayoutCollabWsAdapter) => {
      if (sentJoinPresence || cancelled) return;
      sentJoinPresence = true;
      adapter.sendPresence(
        serializeCollabPresenceClientMessage({
          type: "presence",
          peerKind: "human",
          displayName: collabHumanDisplayName(),
          selectedElementId: null,
          cursorX: null,
          cursorY: null,
        }),
      );
    };

    const connectSession = async () => {
      if (cancelled) return;
      sentJoinPresence = false;
      await teardownSession();
      if (cancelled) return;

      try {
        const { ticket } = await mintLayoutCollabTicket(layoutDocumentId);
        if (cancelled) return;

        const adapter = new LayoutCollabWsAdapter(layoutCollabWsUrl(ticket));
        adapterRef.current = adapter;
        adapter.onConnectionChange = (isConnected, close) => {
          if (cancelled) return;
          setConnected(isConnected);
          if (!isConnected) {
            setSelfPeerId(null);
            if (close?.code === 1000) return;
            scheduleReconnect();
          }
        };
        adapter.onPresenceMessage = (raw) => {
          const agentTask = parseCollabAgentTaskServerMessage(raw);
          if (agentTask) {
            if (agentTask.phase === "started") {
              setAgentTaskActivity({
                taskId: agentTask.taskId,
                registeredAgentId: agentTask.registeredAgentId,
                agentLabel: agentTask.displayName,
              });
            } else {
              setAgentTaskActivity((current) =>
                current?.taskId === agentTask.taskId ? null : current,
              );
            }
            return;
          }

          const sync = parseCollabPresenceServerMessage(raw);
          if (!sync) return;
          setSelfPeerId(sync.selfPeerId);
          const remotePeers = remoteCollabPeers(sync.peers, sync.selfPeerId, sessionUserId());
          setPeers(remotePeers);
          if (remotePeers.some((peer) => peer.peerKind === "agent")) {
            setAgentTaskActivity(null);
          }
          sendJoinPresence(adapter);
        };

        const repo = new Repo({
          network: [adapter],
          storage: createAutomergeIndexedDbStorage("layout-collab"),
          peerId: `layout-client-${crypto.randomUUID()}` as PeerId,
        });
        repoRef.current = repo;
        const documentId = interpretAsDocumentId(layoutDocumentId as AnyDocumentId);
        const handle = await awaitCollabDocHandle<Spec>(repo, documentId);
        if (cancelled) {
          await teardownSession();
          return;
        }

        handleRef.current = handle;

        handle.on("change", ({ doc: next }: { doc: Spec }) => {
          if (applyingLocalRef.current) return;
          applyingRemoteRef.current = true;
          try {
            lastSpecRef.current = next;
            onRemoteSpecRef.current(next);
          } finally {
            applyingRemoteRef.current = false;
          }
        });

        await adapter.whenReady();
        if (cancelled) return;
        await waitForPostConnectSync(handle);
        if (cancelled) return;

        const remoteDoc = handle.doc();
        applyingLocalRef.current = true;
        try {
          const pendingLocal = pendingLocalSpecRef.current;
          if (pendingLocal && specJson(pendingLocal) !== specJson(remoteDoc)) {
            applySpecToHandle(handle, remoteDoc, pendingLocal);
            pendingLocalSpecRef.current = null;
          }
          const current = handle.doc();
          lastSpecRef.current = current;
          const editorSpec = initialSpecRef.current;
          if (editorSpec && specJson(current) !== specJson(editorSpec)) {
            onRemoteSpecRef.current(current);
          }
        } finally {
          applyingLocalRef.current = false;
        }

        reconnectAttempt = 0;
        setConnected(true);
        setError(null);
        sendJoinPresence(adapter);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setConnected(false);
          scheduleReconnect();
        }
      }
    };

    void connectSession();

    return () => {
      cancelled = true;
      clearReconnectTimer();
      void teardownSession();
      setConnected(false);
      setSelfPeerId(null);
      setPeers([]);
      setAgentTaskActivity(null);
    };
  }, [enabled, layoutDocumentId]);

  const updatePresence = useCallback((update: CollabPresenceUpdate) => {
    lastPresenceRef.current = {
      selectedElementId:
        update.selectedElementId !== undefined
          ? update.selectedElementId
          : lastPresenceRef.current.selectedElementId,
      cursorX: update.cursorX !== undefined ? update.cursorX : lastPresenceRef.current.cursorX,
      cursorY: update.cursorY !== undefined ? update.cursorY : lastPresenceRef.current.cursorY,
    };
    adapterRef.current?.sendPresence(
      serializeCollabPresenceClientMessage({
        type: "presence",
        peerKind: "human",
        displayName: collabHumanDisplayName(),
        ...lastPresenceRef.current,
      }),
    );
  }, []);

  const applyLocalSpec = useCallback((next: Spec) => {
    const handle = handleRef.current;
    if (applyingRemoteRef.current || !handle) {
      pendingLocalSpecRef.current = next;
      return;
    }
    pendingLocalSpecRef.current = null;
    applyingLocalRef.current = true;
    try {
      const prev = lastSpecRef.current;
      applySpecToHandle(handle, prev, next);
      lastSpecRef.current = handle.doc();
    } finally {
      applyingLocalRef.current = false;
    }
  }, []);

  return { connected, error, peers, selfPeerId, agentTaskActivity, applyLocalSpec, updatePresence };
}
