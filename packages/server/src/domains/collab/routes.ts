import crypto from "node:crypto";
import { upgradeWebSocket } from "@hono/node-server";
import type { AuthActor } from "@noname/auth";
import type { Hono } from "hono";
import type { WSContext } from "hono/ws";
import { getOrgId } from "../../shared/org";
import { ok } from "../../shared/respond";
import type { AuthorizationPort } from "../auth/authorization-port";
import { requireAuthenticatedActor } from "../auth/guards";
import type { DocumentStorage, LayoutDocumentService } from "../documents/ports";
import { mintCollabTicket, verifyCollabTicket } from "./collab-ticket";
import { canEditLayoutDocument } from "./layout-access";
import type { LayoutCollabRoomManager } from "./layout-room";
import { parseCollabPresenceClientMessage } from "./presence";
import { canEditContentDocument } from "./richtext-access";
import {
  mintRichTextCollabTicket,
  parseRichTextCollabRoomName,
  verifyRichTextCollabTicket,
} from "./richtext-collab-ticket";
import type { RichTextYjsRoomManager } from "./richtext-yjs-room";

export type CollabRoutesDeps = {
  storage: DocumentStorage;
  layout: LayoutDocumentService;
  authorization: AuthorizationPort;
  rooms: LayoutCollabRoomManager;
  richtextRooms: RichTextYjsRoomManager;
};

type PeerMeta = {
  orgId: string;
  layoutDocumentId: string;
  userId: string;
  peerId: string;
};

const peerMetaBySocket = new WeakMap<object, PeerMeta>();

function actorUserId(actor: AuthActor): string {
  if (actor.type === "human") return actor.userId;
  return actor.onBehalfOf;
}

async function readBinaryMessage(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  return null;
}

export function registerCollabRoutes(routes: Hono, deps: CollabRoutesDeps): void {
  routes.post("/layout/ticket", async (c) => {
    const actor = await requireAuthenticatedActor(c);
    if (actor instanceof Response) return actor;

    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json({ error: "org required" }, 400);
    }

    let body: { layoutDocumentId?: string; displayName?: unknown };
    try {
      body = await c.req.json<{ layoutDocumentId?: string; displayName?: unknown }>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const layoutDocumentId = body.layoutDocumentId?.trim();
    if (!layoutDocumentId) {
      return c.json({ error: "layoutDocumentId required" }, 400);
    }

    let displayName: string | undefined;
    if (body.displayName !== undefined) {
      if (typeof body.displayName !== "string") {
        return c.json({ error: "displayName must be a string" }, 400);
      }
      const trimmed = body.displayName.trim().slice(0, 120);
      if (trimmed) displayName = trimmed;
    }
    if (!displayName) {
      return c.json({ error: "displayName required" }, 400);
    }

    const allowed = await canEditLayoutDocument(
      deps.authorization,
      deps.storage,
      orgId,
      layoutDocumentId,
      actor,
    );
    if (!allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }

    try {
      return ok(c, mintCollabTicket(actorUserId(actor), orgId, layoutDocumentId, { displayName }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "collab ticket unavailable";
      return c.json({ error: message }, 503);
    }
  });

  routes.post("/richtext/ticket", async (c) => {
    const actor = await requireAuthenticatedActor(c);
    if (actor instanceof Response) return actor;

    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json({ error: "org required" }, 400);
    }

    let body: { contentDocumentId?: string; fieldKey?: string; locale?: string };
    try {
      body = await c.req.json<{
        contentDocumentId?: string;
        fieldKey?: string;
        locale?: string;
      }>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const contentDocumentId = body.contentDocumentId?.trim();
    const fieldKey = body.fieldKey?.trim();
    const locale = body.locale?.trim();
    if (!contentDocumentId || !fieldKey || !locale) {
      return c.json({ error: "contentDocumentId, fieldKey, and locale required" }, 400);
    }

    const allowed = await canEditContentDocument(
      deps.authorization,
      deps.storage,
      orgId,
      contentDocumentId,
      actor,
    );
    if (!allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }

    try {
      return ok(
        c,
        mintRichTextCollabTicket(actorUserId(actor), orgId, contentDocumentId, fieldKey, locale),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "collab ticket unavailable";
      return c.json({ error: message }, 503);
    }
  });

  routes.get(
    "/layout/ws",
    upgradeWebSocket(() => ({
      onOpen(_event, ws) {
        const url = ws.url;
        if (!url) {
          ws.close(4500, "missing url");
          return;
        }
        const ticketRaw = url.searchParams.get("collab_ticket")?.trim();
        if (!ticketRaw) {
          ws.close(4401, "collab_ticket required");
          return;
        }
        const ticket = verifyCollabTicket(ticketRaw);
        if (!ticket) {
          ws.close(4401, "invalid collab ticket");
          return;
        }

        if (!ticket.displayName?.trim()) {
          ws.close(4400, "displayName required");
          return;
        }

        const raw = ws.raw;
        if (!raw) {
          ws.close(4500, "socket unavailable");
          return;
        }

        const peerId = crypto.randomUUID();
        peerMetaBySocket.set(raw, {
          orgId: ticket.orgId,
          layoutDocumentId: ticket.layoutDocumentId,
          userId: ticket.userId,
          peerId,
        });

        void deps.rooms
          .joinPeer({
            orgId: ticket.orgId,
            layoutDocumentId: ticket.layoutDocumentId,
            userId: ticket.userId,
            peerId,
            ws,
            peerKind: ticket.peerKind,
            displayName: ticket.displayName ?? null,
          })
          .catch((err) => {
            console.error("[collab] join failed", err);
            ws.close(4500, "join failed");
          });
      },
      onMessage(event, ws) {
        const raw = ws.raw;
        if (!raw) return;
        const meta = peerMetaBySocket.get(raw);
        if (!meta) return;

        if (typeof event.data === "string") {
          const message = parseCollabPresenceClientMessage(event.data);
          if (!message) return;
          deps.rooms.handlePresenceMessage(meta.orgId, meta.layoutDocumentId, meta.peerId, message);
          return;
        }

        void readBinaryMessage(event.data).then((bytes) => {
          if (!bytes) return;
          deps.rooms.handleRepoMessage(meta.orgId, meta.layoutDocumentId, meta.peerId, bytes, ws);
        });
      },
      onClose(_event, ws) {
        const raw = ws.raw;
        if (!raw) return;
        const meta = peerMetaBySocket.get(raw);
        if (!meta) return;
        peerMetaBySocket.delete(raw);
        deps.rooms.leavePeer(meta.orgId, meta.layoutDocumentId, meta.peerId, ws);
      },
    })),
  );

  routes.get(
    "/richtext/ws/*",
    upgradeWebSocket(() => ({
      onOpen(_event, ws) {
        const url = ws.url;
        if (!url) {
          ws.close(4500, "missing url");
          return;
        }
        const parsedUrl = new URL(url);
        const prefix = "/api/collab/richtext/ws/";
        if (!parsedUrl.pathname.startsWith(prefix)) {
          ws.close(4500, "invalid path");
          return;
        }
        const roomName = decodeURIComponent(parsedUrl.pathname.slice(prefix.length));
        const room = parseRichTextCollabRoomName(roomName);
        if (!room) {
          ws.close(4400, "invalid room");
          return;
        }

        const ticketRaw = parsedUrl.searchParams.get("collab_ticket")?.trim();
        if (!ticketRaw) {
          ws.close(4401, "collab_ticket required");
          return;
        }
        const ticket = verifyRichTextCollabTicket(ticketRaw);
        if (!ticket) {
          ws.close(4401, "invalid collab ticket");
          return;
        }
        if (
          ticket.orgId !== room.orgId ||
          ticket.contentDocumentId !== room.contentDocumentId ||
          ticket.fieldKey !== room.fieldKey ||
          ticket.locale !== room.locale
        ) {
          ws.close(4403, "ticket room mismatch");
          return;
        }

        deps.richtextRooms.joinPeer(roomName, ws);
      },
      onMessage(event, ws) {
        const url = ws.url;
        if (!url) return;
        const parsedUrl = new URL(url);
        const prefix = "/api/collab/richtext/ws/";
        if (!parsedUrl.pathname.startsWith(prefix)) return;
        const roomName = decodeURIComponent(parsedUrl.pathname.slice(prefix.length));
        deps.richtextRooms.handleMessage(roomName, ws, event.data);
      },
      onClose(_event, ws) {
        const url = ws.url;
        if (!url) return;
        const parsedUrl = new URL(url);
        const prefix = "/api/collab/richtext/ws/";
        if (!parsedUrl.pathname.startsWith(prefix)) return;
        const roomName = decodeURIComponent(parsedUrl.pathname.slice(prefix.length));
        deps.richtextRooms.leavePeer(roomName, ws);
      },
    })),
  );
}

void (null as WSContext | null);
