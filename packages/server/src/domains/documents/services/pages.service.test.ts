import { afterEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "../../../shared/event-bus";
import { PageEvents, PageTreeEvents } from "../events";
import type { DocumentDTO, DocumentStorage } from "../ports";
import { documentRow, ORG } from "../test-helpers";
import { createPagesService } from "./pages.service";

const PAGE_KEY = "home";
const TREE_ID = "tree-main";

function pagesStorage(options: {
  page?: DocumentDTO | null;
  tree?: DocumentDTO | null;
}): DocumentStorage {
  let page = options.page ?? null;
  let tree = options.tree ?? null;

  return {
    findDocument: async (_orgId, type, key) => {
      if (type === "page" && key === PAGE_KEY) return page;
      if (type === "page_tree" && key === "main") return tree;
      return null;
    },
    createDocument: async (input) => {
      const row = {
        ...documentRow(input.key, input.type, input.orgId),
        id: input.type === "page_tree" ? TREE_ID : "page-new",
        data: input.data,
        status: input.status ?? "draft",
      };
      if (input.type === "page") page = row;
      if (input.type === "page_tree") tree = row;
      return row;
    },
    updateDocument: async (id, data) => {
      if (page?.id === id) {
        page = { ...page, data: { ...page.data, ...data } };
        return page;
      }
      if (tree?.id === id) {
        tree = { ...tree, data: { ...tree.data, ...data } };
        return tree;
      }
      throw new Error("not found");
    },
    publishDocument: async (id) => {
      if (page?.id === id) {
        page = { ...page, status: "published" };
        return page;
      }
      if (tree?.id === id) {
        tree = { ...tree, status: "published" };
        return tree;
      }
      throw new Error("not found");
    },
  } as DocumentStorage;
}

describe("pages.service events", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("upsertPage publishes created + published for a new page", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    const pages = createPagesService(pagesStorage({ page: null }));

    await pages.upsertPage(ORG, PAGE_KEY, { layoutRef: "layout:1", contentRef: "content:1" });

    expect(publish).toHaveBeenCalledWith(PageEvents.CREATED, {
      orgId: ORG,
      id: "page-new",
      pageKey: PAGE_KEY,
    });
    expect(publish).toHaveBeenCalledWith(PageEvents.PUBLISHED, {
      orgId: ORG,
      id: "page-new",
      pageKey: PAGE_KEY,
    });
  });

  it("upsertPage publishes updated + published when existing page is draft", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    const existing = documentRow("page-existing", "page");
    existing.key = PAGE_KEY;
    existing.status = "draft";
    const pages = createPagesService(pagesStorage({ page: existing }));

    await pages.upsertPage(ORG, PAGE_KEY, { layoutRef: "layout:2" });

    expect(publish).toHaveBeenCalledWith(PageEvents.UPDATED, {
      orgId: ORG,
      id: existing.id,
      pageKey: PAGE_KEY,
    });
    expect(publish).toHaveBeenCalledWith(PageEvents.PUBLISHED, {
      orgId: ORG,
      id: existing.id,
      pageKey: PAGE_KEY,
    });
  });

  it("upsertPage publishes only updated when page is already published", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    const existing = documentRow("page-existing", "page");
    existing.key = PAGE_KEY;
    existing.status = "published";
    const pages = createPagesService(pagesStorage({ page: existing }));

    await pages.upsertPage(ORG, PAGE_KEY, { layoutRef: "layout:2" });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(PageEvents.UPDATED, {
      orgId: ORG,
      id: existing.id,
      pageKey: PAGE_KEY,
    });
  });

  it("upsertMainTree publishes created for a new tree", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    const pages = createPagesService(pagesStorage({ tree: null }));

    await pages.upsertMainTree(ORG, []);

    expect(publish).toHaveBeenCalledWith(PageTreeEvents.CREATED, {
      orgId: ORG,
      id: TREE_ID,
      key: "main",
    });
  });

  it("upsertMainTree publishes updated for an existing published tree", async () => {
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);
    const tree = documentRow(TREE_ID, "page_tree");
    tree.key = "main";
    tree.status = "published";
    const pages = createPagesService(pagesStorage({ tree }));

    await pages.upsertMainTree(ORG, [{ id: "p1", slug: { "en-US": "/" }, pageId: "page-1" }]);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(PageTreeEvents.UPDATED, {
      orgId: ORG,
      id: TREE_ID,
      key: "main",
    });
  });
});
