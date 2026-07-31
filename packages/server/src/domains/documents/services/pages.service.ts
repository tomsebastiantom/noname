import { emitDocumentEvent } from "../emit-event";
import { PageEvents, PageTreeEvents } from "../events";
import type { DocumentStorage, PageDTO, PageTreeDTO, PageTreeService } from "../ports";
import { isPublished } from "../shared/document-status";
import { DEFAULT_DEFAULT_LOCALE } from "./constants";
import { toRoutingPageView } from "./routing-page";

/** Normalize URL paths for page_tree slug matching ("/about/" → "/about"). */
export function normalizeRoutePath(url: string): string {
  if (!url || url === "/") return "/";
  const path = url.startsWith("/") ? url : `/${url}`;
  return path.replace(/\/+$/, "") || "/";
}

export function createPagesService(storage: DocumentStorage): PageTreeService {
  return {
    async resolveByUrl(orgId, url, locale) {
      const tree = await storage.findDocument(orgId, "page_tree", "main");
      if (!tree) return null;
      const pageRefs =
        (tree.data.pages as
          | Array<{ id: string; slug: Record<string, string>; pageId: string }>
          | undefined) ?? [];

      const ts = await storage.getTenantSettings(orgId);
      const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;
      const normalized = normalizeRoutePath(url);

      const match = pageRefs.find((p) => {
        const slugMap = p.slug ?? {};
        return (
          slugMap[locale] === normalized ||
          slugMap[defaultLocale] === normalized ||
          Object.values(slugMap).some((slug) => normalizeRoutePath(slug) === normalized)
        );
      });
      if (!match) return null;

      const page = await storage.findDocument(orgId, "page", match.pageId);
      if (!page) return null;
      const data = page.data;
      return {
        pageId: match.pageId,
        layoutRef: (data.layoutRef as string) ?? "",
        contentRef: (data.contentRef as string) ?? "",
        locale,
      };
    },

    async getMainTree(orgId) {
      const tree = await storage.findDocument(orgId, "page_tree", "main");
      if (!tree) return null;
      const pageRefs =
        (tree.data.pages as
          | Array<{ id: string; slug: Record<string, string>; pageId: string }>
          | undefined) ?? [];
      return {
        id: tree.id,
        status: tree.status,
        pages: pageRefs,
      };
    },

    async listRoutingPages(orgId) {
      const rows = await storage.listDocuments(orgId, { type: "page" });
      return rows
        .filter((row) => typeof row.data.layoutRef === "string")
        .map(toRoutingPageView)
        .sort((a, b) => a.key.localeCompare(b.key));
    },

    async getRoutingPage(orgId, pageKey) {
      const row = await storage.findDocument(orgId, "page", pageKey);
      if (!row || typeof row.data.layoutRef !== "string") return null;
      return toRoutingPageView(row);
    },

    async upsertMainTree(orgId, pageRefs) {
      const existing = await storage.findDocument(orgId, "page_tree", "main");
      const data = { pages: pageRefs };
      if (existing) {
        const updated = await storage.updateDocument(existing.id, data);
        emitDocumentEvent(PageTreeEvents.UPDATED, { orgId, id: existing.id, key: "main" });
        if (!isPublished(existing)) {
          const published = (await storage.publishDocument(existing.id)) as unknown as PageTreeDTO;
          return published;
        }
        return updated as unknown as PageTreeDTO;
      }
      const created = await storage.createDocument({
        orgId,
        type: "page_tree",
        key: "main",
        segment: "default",
        data,
        status: "published",
      });
      emitDocumentEvent(PageTreeEvents.CREATED, { orgId, id: created.id, key: "main" });
      return created as unknown as PageTreeDTO;
    },

    async upsertPage(orgId, pageKey, input) {
      const data = {
        layoutRef: input.layoutRef,
        contentRef: input.contentRef ?? "",
      };
      const existing = await storage.findDocument(orgId, "page", pageKey);
      if (existing) {
        const updated = await storage.updateDocument(existing.id, data);
        emitDocumentEvent(PageEvents.UPDATED, { orgId, id: existing.id, pageKey });
        if (!isPublished(existing)) {
          const published = (await storage.publishDocument(existing.id)) as unknown as PageDTO;
          emitDocumentEvent(PageEvents.PUBLISHED, { orgId, id: existing.id, pageKey });
          return published;
        }
        return updated as unknown as PageDTO;
      }
      const created = await storage.createDocument({
        orgId,
        type: "page",
        key: pageKey,
        segment: "default",
        data,
        status: "published",
      });
      emitDocumentEvent(PageEvents.CREATED, { orgId, id: created.id, pageKey });
      emitDocumentEvent(PageEvents.PUBLISHED, { orgId, id: created.id, pageKey });
      return created as unknown as PageDTO;
    },
  };
}
