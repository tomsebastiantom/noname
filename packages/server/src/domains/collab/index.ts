import { Hono } from "hono";
import type { Database } from "../../drizzle";
import type { AuthorizationPort } from "../auth/authorization-port";
import type {
  ContentDocumentService,
  DocumentStorage,
  LayoutDocumentService,
} from "../documents/ports";
import { createLayoutCollabRoomManager } from "./layout-room";
import { createRichTextYjsRoomManager } from "./richtext-yjs-room";
import { registerCollabRoutes } from "./routes";

export type CollabDomainDeps = {
  storage: DocumentStorage;
  layout: LayoutDocumentService;
  content: ContentDocumentService;
  authorization: AuthorizationPort;
  db: Database;
};

/** In-process Yjs rooms. Multi-API scaling needs Redis/Hocuspocus-style sync (deferred). */
export function createCollabDomain(deps: CollabDomainDeps) {
  const rooms = createLayoutCollabRoomManager({
    layout: deps.layout,
    db: deps.db,
  });
  const richtextRooms = createRichTextYjsRoomManager({
    content: deps.content,
    storage: deps.storage,
  });
  const routes = new Hono();
  registerCollabRoutes(routes, { ...deps, rooms, richtextRooms });
  return { routes, rooms, richtextRooms };
}
