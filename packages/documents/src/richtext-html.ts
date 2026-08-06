import { embedBlockLabel, parseEmbedTarget } from "./richtext-embed";
import { resolvedEmbedMeta } from "./richtext-resolve";

export type RichTextMark = { type: string };
export type RichTextNode = {
  nodeType: string;
  value?: string;
  marks?: RichTextMark[];
  data?: Record<string, unknown>;
  content?: RichTextNode[];
};
export type RichTextDocument = {
  nodeType: "document";
  content: RichTextNode[];
};

export function isRichTextDocument(value: unknown): value is RichTextDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RichTextDocument).nodeType === "document" &&
    Array.isArray((value as RichTextDocument).content)
  );
}

export function richTextToPlainText(doc: RichTextDocument): string {
  const parts: string[] = [];
  walkBlockNodes(doc.content, (node) => {
    if (node.nodeType === "text" && node.value) parts.push(node.value);
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Email + SMS channel output from the same canonical JSON tree. */
export function renderRichTextForEmail(doc: RichTextDocument): { html: string; text: string } {
  return {
    html: richTextToHtml(doc),
    text: richTextToPlainText(doc),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarksHtml(text: string, marks: RichTextMark[] | undefined): string {
  const escaped = escapeHtml(text);
  if (!marks?.length) return escaped;
  let html = escaped;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        html = `<strong>${html}</strong>`;
        break;
      case "italic":
        html = `<em>${html}</em>`;
        break;
      case "underline":
        html = `<span style="text-decoration:underline">${html}</span>`;
        break;
      case "code":
        html = `<code>${html}</code>`;
        break;
      case "strikethrough":
        html = `<s>${html}</s>`;
        break;
      default:
        break;
    }
  }
  return html;
}

function renderInlineHtml(node: RichTextNode): string {
  if (node.nodeType === "text") return renderMarksHtml(node.value ?? "", node.marks);
  if (node.nodeType === "hyperlink") {
    const uri = typeof node.data?.uri === "string" ? node.data.uri : "#";
    const inner = node.content?.map((child) => renderInlineHtml(child)).join("") ?? "";
    return `<a href="${escapeHtml(uri)}">${inner}</a>`;
  }
  if (node.nodeType === "embedded-asset-inline") {
    const meta = resolvedEmbedMeta(node);
    const target = parseEmbedTarget(node.data);
    const alt = escapeHtml(target?.altText ?? meta?.label ?? "Asset");
    const url = meta?.imageUrl ?? meta?.url;
    if (url) return `<img src="${escapeHtml(url)}" alt="${alt}" />`;
    return `<span>[${alt}]</span>`;
  }
  if (node.nodeType === "embedded-entry-inline") {
    const meta = resolvedEmbedMeta(node);
    return `<span>[${escapeHtml(meta?.label ?? embedBlockLabel(node))}]</span>`;
  }
  return "";
}

function renderTableCell(node: RichTextNode): string {
  const inner =
    node.content
      ?.map((child) =>
        child.nodeType === "paragraph"
          ? renderInlineHtmlFromNodes(child.content)
          : renderBlockHtml(child),
      )
      .join("") ?? "";
  return `<td>${inner || "&nbsp;"}</td>`;
}

function renderInlineHtmlFromNodes(nodes: RichTextNode[] | undefined): string {
  return nodes?.map((child) => renderInlineHtml(child)).join("") ?? "";
}

function renderBlockHtml(node: RichTextNode): string {
  if (node.nodeType === "table-row") {
    return `<tr>${node.content?.map((cell) => renderTableCell(cell)).join("") ?? ""}</tr>`;
  }
  if (node.nodeType === "table") {
    return `<table>${node.content?.map((row) => renderBlockHtml(row)).join("") ?? ""}</table>`;
  }

  const inline = renderInlineHtmlFromNodes(node.content);
  switch (node.nodeType) {
    case "paragraph":
      return `<p>${inline}</p>`;
    case "heading-1":
      return `<h1>${inline}</h1>`;
    case "heading-2":
      return `<h2>${inline}</h2>`;
    case "heading-3":
      return `<h3>${inline}</h3>`;
    case "heading-4":
      return `<h4>${inline}</h4>`;
    case "heading-5":
      return `<h5>${inline}</h5>`;
    case "heading-6":
      return `<h6>${inline}</h6>`;
    case "blockquote":
      return `<blockquote>${inline}</blockquote>`;
    case "unordered-list":
      return `<ul>${
        node.content
          ?.filter((child) => child.nodeType === "list-item")
          .map((item) => `<li>${renderInlineHtmlFromNodes(item.content)}</li>`)
          .join("") ?? ""
      }</ul>`;
    case "ordered-list":
      return `<ol>${
        node.content
          ?.filter((child) => child.nodeType === "list-item")
          .map((item) => `<li>${renderInlineHtmlFromNodes(item.content)}</li>`)
          .join("") ?? ""
      }</ol>`;
    case "hr":
      return "<hr />";
    case "code-block":
      return `<pre><code>${escapeHtml(node.content?.map((c) => c.value ?? "").join("") ?? "")}</code></pre>`;
    case "embedded-asset-block": {
      const meta = resolvedEmbedMeta(node);
      const target = parseEmbedTarget(node.data);
      if (!target) return "";
      const alt = escapeHtml(target.altText ?? meta?.label ?? "Embedded asset");
      const url = meta?.imageUrl ?? meta?.url;
      if (url) {
        return `<figure><img src="${escapeHtml(url)}" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`;
      }
      return `<figure data-embedded-asset="${escapeHtml(target.documentId)}"><figcaption>${alt}</figcaption></figure>`;
    }
    case "embedded-entry-block": {
      const meta = resolvedEmbedMeta(node);
      const target = parseEmbedTarget(node.data);
      if (!target) return "";
      return `<aside data-embedded-entry="${escapeHtml(target.documentId)}">${escapeHtml(meta?.label ?? embedBlockLabel(node))}</aside>`;
    }
    case "embedded-video-block": {
      const meta = resolvedEmbedMeta(node);
      const target = parseEmbedTarget(node.data);
      if (!target) return "";
      const caption = escapeHtml(target.caption ?? meta?.label ?? "Video");
      const url = meta?.url ?? meta?.imageUrl;
      if (url) {
        return `<figure><video controls src="${escapeHtml(url)}"></video><figcaption>${caption}</figcaption></figure>`;
      }
      return `<figure data-embedded-video="${escapeHtml(target.documentId)}"><figcaption>${caption}</figcaption></figure>`;
    }
    default:
      return inline ? `<p>${inline}</p>` : "";
  }
}

/** Safe semantic HTML for SEO/bot SSR and email HTML bodies (text escaped). */
export function richTextToHtml(doc: RichTextDocument): string {
  return doc.content.map((node) => renderBlockHtml(node)).join("\n");
}

function walkBlockNodes(
  nodes: RichTextNode[] | undefined,
  visit: (node: RichTextNode) => void,
): void {
  if (!nodes) return;
  for (const node of nodes) {
    visit(node);
    if (node.content) walkBlockNodes(node.content, visit);
  }
}
