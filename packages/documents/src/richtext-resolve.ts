import type { RichTextNode } from "./richtext";
import { parseEmbedTarget, type RichTextEmbedTarget } from "./richtext-embed";

export interface ResolvedEmbedMeta {
  label: string;
  imageUrl: string | null;
  url: string | null;
}

export function collectRichTextEmbedIds(nodes: RichTextNode[] | undefined, ids: Set<string>): void {
  if (!nodes) return;
  for (const node of nodes) {
    const target = parseEmbedTarget(node.data);
    if (target?.documentId) ids.add(target.documentId);
    if (node.content) collectRichTextEmbedIds(node.content, ids);
  }
}

/** Inject `_resolved` onto embed targets after batch ref resolve. */
export function applyRichTextEmbedResolution(
  nodes: RichTextNode[] | undefined,
  resolved: Record<string, { label: string; imageUrl: string | null } | null | undefined>,
): RichTextNode[] | undefined {
  if (!nodes) return nodes;
  return nodes.map((node) => {
    const target = parseEmbedTarget(node.data);
    if (target?.documentId) {
      const hit = resolved[target.documentId];
      if (hit) {
        return {
          ...node,
          data: {
            ...node.data,
            target: {
              ...(node.data?.target as Record<string, unknown>),
              _resolved: {
                label: hit.label,
                imageUrl: hit.imageUrl,
                url: hit.imageUrl,
              },
            },
          },
          content: node.content
            ? applyRichTextEmbedResolution(node.content, resolved)
            : node.content,
        };
      }
    }
    return {
      ...node,
      content: node.content ? applyRichTextEmbedResolution(node.content, resolved) : node.content,
    };
  });
}

export function resolvedEmbedMeta(node: RichTextNode): ResolvedEmbedMeta | null {
  const target = node.data?.target;
  if (!target || typeof target !== "object" || Array.isArray(target)) return null;
  const resolved = (target as Record<string, unknown>)._resolved;
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) return null;
  const record = resolved as Record<string, unknown>;
  return {
    label: typeof record.label === "string" ? record.label : "",
    imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : null,
    url: typeof record.url === "string" ? record.url : null,
  };
}

export function embedTargetWithResolved(
  target: RichTextEmbedTarget,
  resolved: ResolvedEmbedMeta,
): Record<string, unknown> {
  return {
    target: {
      ...target,
      _resolved: resolved,
    },
  };
}
