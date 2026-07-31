import { enrichAssetUrls, validateAssetMime } from "../assets/enrich";
import { urlFromStorageKey } from "../assets/url";
import type { AssetDocumentService, AssetDTO, DocumentStorage, UploadAssetInput } from "../ports";
import { requireAssetDocument } from "./document-guards";

export function createAssetsService(storage: DocumentStorage): AssetDocumentService {
  return {
    async create(orgId, input: UploadAssetInput) {
      validateAssetMime(input.mimeType);
      const assetId = crypto.randomUUID();
      const data: Record<string, unknown> = {
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        storageKey: input.storageKey,
        hash: input.hash,
        original: {
          url: urlFromStorageKey(input.storageKey),
          width: input.width ?? null,
          height: input.height ?? null,
        },
        variants: input.variants ?? {},
        altText: input.altText ?? null,
        caption: input.caption ?? null,
        focalPoint: input.focalPoint ?? null,
        uploadedAt: new Date().toISOString(),
      };
      const saved = await storage.createDocument({
        orgId,
        type: "asset",
        key: assetId,
        data,
        status: "draft",
      });
      return saved as unknown as AssetDTO;
    },

    async findByHash(orgId, hash) {
      const found = await storage.findAssetByHash(orgId, hash);
      return found ? (found as unknown as AssetDTO) : null;
    },

    get: async (orgId, documentId) => {
      const found = await storage.findDocumentById(documentId);
      if (!found || found.orgId !== orgId || found.type !== "asset") return null;
      return enrichAssetUrls(found as unknown as AssetDTO);
    },

    list: async (orgId) => {
      const rows = await storage.listDocuments(orgId, { type: "asset" });
      return rows.map((r) => enrichAssetUrls(r as unknown as AssetDTO)) as AssetDTO[];
    },

    async update(orgId, documentId, input) {
      const existing = await requireAssetDocument(storage, orgId, documentId);
      const data = { ...existing.data };
      if (input.altText !== undefined) data.altText = input.altText;
      if (input.caption !== undefined) data.caption = input.caption;
      if (input.focalPoint !== undefined) data.focalPoint = input.focalPoint;
      if (input.variants !== undefined) data.variants = input.variants;
      const updated = await storage.updateDocument(existing.id, data);
      return enrichAssetUrls(updated as unknown as AssetDTO);
    },

    async archive(orgId, documentId) {
      const existing = await requireAssetDocument(storage, orgId, documentId);
      return (await storage.archiveDocument(existing.id)) as unknown as AssetDTO;
    },

    async delete(orgId, documentId) {
      const existing = await requireAssetDocument(storage, orgId, documentId);
      await storage.deleteDocument(existing.id);
    },

    async publish(orgId, documentId) {
      const existing = await requireAssetDocument(storage, orgId, documentId);
      return (await storage.publishDocument(existing.id)) as unknown as AssetDTO;
    },
  };
}
