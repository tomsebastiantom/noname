import Collaboration from "@tiptap/extension-collaboration";
import { useEffect, useRef, useState } from "react";
import { YTiptapCollaborationCursor } from "./y-tiptap-collaboration-cursor";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { sessionUserEmail } from "../../auth/session";
import { mintRichTextCollabTicket, richTextCollabWsBaseUrl } from "../../editor/collab/collab-api";
import { peerPresenceColor } from "../../editor/collab/presence";

export type RichTextCollabBinding = {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  connected: boolean;
};

export function useRichTextCollab(input: {
  enabled: boolean;
  contentDocumentId: string | null | undefined;
  fieldKey: string;
  locale: string;
}): {
  binding: RichTextCollabBinding | null;
  connected: boolean;
  error: string | null;
  synced: boolean;
  /** Y.Doc synced with server — safe to mount TipTap with Collaboration extensions. */
  ready: boolean;
} {
  const [binding, setBinding] = useState<RichTextCollabBinding | null>(null);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);

  useEffect(() => {
    if (!input.enabled || !input.contentDocumentId) {
      setBinding(null);
      setConnected(false);
      setSynced(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const localDoc = new Y.Doc();
    ydocRef.current = localDoc;

    const idbName = `noname-richtext:${input.contentDocumentId}:${input.fieldKey}:${input.locale}`;
    persistenceRef.current = new IndexeddbPersistence(idbName, localDoc);

    void (async () => {
      try {
        const ticketPayload = await mintRichTextCollabTicket({
          contentDocumentId: input.contentDocumentId as string,
          fieldKey: input.fieldKey,
          locale: input.locale,
        });
        if (cancelled) return;

        const wsProvider = new WebsocketProvider(
          richTextCollabWsBaseUrl(),
          ticketPayload.roomName,
          localDoc,
          {
            connect: true,
            params: { collab_ticket: ticketPayload.ticket },
          },
        );
        providerRef.current = wsProvider;

        const onStatus = (event: { status: string }) => {
          if (cancelled) return;
          const isConnected = event.status === "connected";
          setConnected(isConnected);
          if (isConnected) {
            setError(null);
          }
          setBinding((prev) =>
            prev
              ? { ...prev, connected: isConnected }
              : { ydoc: localDoc, provider: wsProvider, connected: isConnected },
          );
        };
        wsProvider.on("status", onStatus);
        wsProvider.on("connection-error", () => {
          if (!cancelled) setError("Rich text collab connection failed");
        });
        const onSync = (isSynced: boolean) => {
          if (!cancelled) setSynced(isSynced);
        };
        wsProvider.on("sync", onSync);
        if (wsProvider.synced) onSync(true);

        if (!cancelled) {
          setBinding({ ydoc: localDoc, provider: wsProvider, connected: false });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setConnected(false);
          setSynced(false);
          setBinding(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      providerRef.current?.destroy();
      providerRef.current = null;
      persistenceRef.current?.destroy();
      persistenceRef.current = null;
      ydocRef.current?.destroy();
      ydocRef.current = null;
      setBinding(null);
      setConnected(false);
      setSynced(false);
    };
  }, [input.contentDocumentId, input.enabled, input.fieldKey, input.locale]);

  const ready = binding !== null && synced;
  return { binding, connected, error, synced, ready };
}

export function richTextCollabUser(peerSeed: string): { name: string; color: string } {
  const email = sessionUserEmail();
  return {
    name: email ?? "Editor",
    color: peerPresenceColor(peerSeed),
  };
}

export function richTextCollabExtensions(input: {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  peerSeed: string;
}) {
  const user = richTextCollabUser(input.peerSeed);
  return {
    collaboration: Collaboration.configure({ document: input.ydoc }),
    /** After Collaboration — uses @tiptap/y-tiptap yCursorPlugin (not y-prosemirror). */
    collaborationCursor: YTiptapCollaborationCursor.configure({
      awareness: input.provider.awareness,
      user,
    }),
  };
}
