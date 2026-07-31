import type { DocumentStorage, PageDTO, PageTreeDTO, PageTreeService } from "../ports";
import { DEFAULT_DEFAULT_LOCALE } from "./constants";

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
        .map((row) => ({
          id: row.id,
          key: row.key,
          status: row.status,
          layoutRef: (row.data.layoutRef as string) ?? "",
          contentRef: (row.data.contentRef as string) ?? "",
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
    },

    async getRoutingPage(orgId, pageKey) {
      const row = await storage.findDocument(orgId, "page", pageKey);
      if (!row || typeof row.data.layoutRef !== "string") return null;
      return {
        id: row.id,
        key: row.key,
        status: row.status,
        layoutRef: (row.data.layoutRef as string) ?? "",
        contentRef: (row.data.contentRef as string) ?? "",
      };
    },

    async upsertMainTree(orgId, pageRefs) {
      const existing = await storage.findDocument(orgId, "page_tree", "main");
      const data = { pages: pageRefs };
      if (existing) {
        const updated = await storage.updateDocument(existing.id, data);
        if (existing.status !== "published") {
          return (await storage.publishDocument(existing.id)) as unknown as PageTreeDTO;
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
        if (existing.status !== "published") {
          return (await storage.publishDocument(existing.id)) as unknown as PageDTO;
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
      return created as unknown as PageDTO;
    },
  };
}
