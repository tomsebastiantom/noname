import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { useEffect, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { sessionUserEmail } from "../../auth/session";
import { mintRichTextCollabTicket, richTextCollabWsBaseUrl } from "../../editor/collab/collab-api";
import { peerPresenceColor } from "../../editor/collab/presence";

export function useRichTextCollab(input: {
  enabled: boolean;
  contentDocumentId: string | null | undefined;
  fieldKey: string;
  locale: string;
}): {
  ydoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  connected: boolean;
  error: string | null;
} {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  useEffect(() => {
    if (!input.enabled || !input.contentDocumentId) {
      setConnected(false);
      setError(null);
      setYdoc(null);
      setProvider(null);
      return;
    }

    let cancelled = false;
    const localDoc = new Y.Doc();
    ydocRef.current = localDoc;
    setYdoc(localDoc);

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
        setProvider(wsProvider);

        const onStatus = (event: { status: string }) => {
          if (cancelled) return;
          setConnected(event.status === "connected");
          if (event.status === "connected") {
            setError(null);
          }
        };
        wsProvider.on("status", onStatus);
        wsProvider.on("connection-error", () => {
          if (!cancelled) setError("Rich text collab connection failed");
        });

        return () => {
          wsProvider.off("status", onStatus);
        };
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setConnected(false);
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
      setProvider(null);
      setYdoc(null);
      setConnected(false);
    };
  }, [input.contentDocumentId, input.enabled, input.fieldKey, input.locale]);

  return { ydoc, provider, connected, error };
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
  return [
    Collaboration.configure({ document: input.ydoc }),
    CollaborationCursor.configure({
      provider: input.provider,
      user,
    }),
  ];
}
