import { mergeAttributes, Node } from "@tiptap/core";

/** Minimal embed node defs — must match client `tiptap-extensions.ts` names/attrs. */
function embedBlockExtension(name: string, tag: string, className: string) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,
    addAttributes() {
      return {
        documentId: { default: null },
        altText: { default: "" },
        contentType: { default: "" },
        caption: { default: "" },
      };
    },
    parseHTML() {
      return [{ tag }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { class: className }), 0];
    },
  });
}

function embedInlineExtension(name: string, className: string) {
  return Node.create({
    name,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return {
        documentId: { default: null },
        altText: { default: "" },
        contentType: { default: "" },
      };
    },
    parseHTML() {
      return [{ tag: "span[data-embed-inline]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "span",
        mergeAttributes(HTMLAttributes, { class: className, "data-embed-inline": "" }),
        0,
      ];
    },
  });
}

export const agentRichTextEmbedExtensions = [
  embedBlockExtension(
    "embeddedAssetBlock",
    "figure[data-embedded-asset]",
    "rich-text-embed rich-text-embed-asset",
  ),
  embedBlockExtension(
    "embeddedEntryBlock",
    "aside[data-embedded-entry]",
    "rich-text-embed rich-text-embed-entry",
  ),
  embedBlockExtension(
    "embeddedVideoBlock",
    "figure[data-embedded-video]",
    "rich-text-embed rich-text-embed-video",
  ),
  embedInlineExtension(
    "embeddedAssetInline",
    "rich-text-embed-inline rich-text-embed-asset-inline",
  ),
  embedInlineExtension(
    "embeddedEntryInline",
    "rich-text-embed-inline rich-text-embed-entry-inline",
  ),
];
