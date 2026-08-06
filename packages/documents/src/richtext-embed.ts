import type { RichTextNode } from "./richtext";

export interface RichTextEmbedTarget {
  type: "asset" | "entry" | "video";
  documentId: string;
  altText?: string;
  contentType?: string;
  caption?: string;
}

export function parseEmbedTarget(
  data: Record<string, unknown> | undefined,
): RichTextEmbedTarget | null {
  const target = data?.target;
  if (!target || typeof target !== "object" || Array.isArray(target)) return null;
  const record = target as Record<string, unknown>;
  const documentId = typeof record.documentId === "string" ? record.documentId : "";
  if (!documentId) return null;
  const typeRaw = record.type;
  const type = typeRaw === "entry" ? "entry" : typeRaw === "video" ? "video" : ("asset" as const);
  return {
    type,
    documentId,
    altText: typeof record.altText === "string" ? record.altText : undefined,
    contentType: typeof record.contentType === "string" ? record.contentType : undefined,
    caption: typeof record.caption === "string" ? record.caption : undefined,
  };
}

export function embeddedAssetBlockNode(input: {
  documentId: string;
  altText?: string;
}): RichTextNode {
  return {
    nodeType: "embedded-asset-block",
    data: {
      target: {
        type: "asset",
        documentId: input.documentId,
        ...(input.altText ? { altText: input.altText } : {}),
      },
    },
  };
}

export function embeddedEntryBlockNode(input: {
  documentId: string;
  contentType: string;
}): RichTextNode {
  return {
    nodeType: "embedded-entry-block",
    data: {
      target: {
        type: "entry",
        documentId: input.documentId,
        contentType: input.contentType,
      },
    },
  };
}

export function embeddedAssetInlineNode(input: {
  documentId: string;
  altText?: string;
}): RichTextNode {
  return {
    nodeType: "embedded-asset-inline",
    data: {
      target: {
        type: "asset",
        documentId: input.documentId,
        ...(input.altText ? { altText: input.altText } : {}),
      },
    },
  };
}

export function embeddedEntryInlineNode(input: {
  documentId: string;
  contentType: string;
}): RichTextNode {
  return {
    nodeType: "embedded-entry-inline",
    data: {
      target: {
        type: "entry",
        documentId: input.documentId,
        contentType: input.contentType,
      },
    },
  };
}

export function embeddedVideoBlockNode(input: {
  documentId: string;
  caption?: string;
}): RichTextNode {
  return {
    nodeType: "embedded-video-block",
    data: {
      target: {
        type: "video",
        documentId: input.documentId,
        ...(input.caption ? { caption: input.caption } : {}),
      },
    },
  };
}

export function embedBlockLabel(node: RichTextNode): string {
  const target = parseEmbedTarget(node.data);
  if (!target) return "Embedded block";
  if (target.type === "asset") {
    return target.altText?.trim() || `Asset ${target.documentId.slice(0, 8)}…`;
  }
  if (target.type === "video") {
    return target.caption?.trim() || `Video ${target.documentId.slice(0, 8)}…`;
  }
  return `${target.contentType ?? "entry"}:${target.documentId.slice(0, 8)}…`;
}
