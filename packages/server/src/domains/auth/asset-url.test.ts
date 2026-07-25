import { describe, expect, it } from "vitest";
import { resolveProviderIconUrls } from "./asset-url";

describe("resolveProviderIconUrls", () => {
  it("resolves asset refs to URLs using storageKey", async () => {
    const icons = await resolveProviderIconUrls(
      "org-1",
      ["google"],
      { google: { documentId: "asset-1" } },
      {
        get: async () => ({
          id: "asset-1",
          orgId: "org-1",
          type: "asset",
          key: "asset-1",
          version: 1,
          segment: "default",
          status: "draft",
          baseVersion: null,
          data: { storageKey: "org-1/hash/google.svg" },
          meta: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        create: async () => {
          throw new Error("not used");
        },
        findByHash: async () => null,
        list: async () => [],
        update: async () => {
          throw new Error("not used");
        },
        archive: async () => {
          throw new Error("not used");
        },
        delete: async () => {},
        publish: async () => {
          throw new Error("not used");
        },
      },
    );

    expect(icons.google).toContain("org-1/hash/google.svg");
  });

  it("skips providers without an asset ref", async () => {
    const icons = await resolveProviderIconUrls(
      "org-1",
      ["github"],
      {},
      {
        get: async () => null,
        create: async () => {
          throw new Error("not used");
        },
        findByHash: async () => null,
        list: async () => [],
        update: async () => {
          throw new Error("not used");
        },
        archive: async () => {
          throw new Error("not used");
        },
        delete: async () => {},
        publish: async () => {
          throw new Error("not used");
        },
      },
    );

    expect(icons).toEqual({});
  });
});
