import type { RichTextDocument, RichTextMark, RichTextNode } from "@noname/documents";
import { embedBlockLabel, parseEmbedTarget, resolvedEmbedMeta } from "@noname/documents";
import type { ReactNode } from "react";

function inlineTextSignature(nodes: RichTextNode[] | undefined): string {
  return nodes?.map((node) => `${node.nodeType}:${node.value ?? ""}`).join("|") ?? "";
}

function listItemKey(prefix: string, item: RichTextNode): string {
  return `${prefix}-li-${inlineTextSignature(item.content)}`;
}

function tableRowKey(prefix: string, row: RichTextNode): string {
  const cells = row.content
    ?.filter((cell) => cell.nodeType === "table-cell")
    .map((cell) => {
      const paragraph = cell.content?.find((child) => child.nodeType === "paragraph");
      return inlineTextSignature(paragraph?.content ?? cell.content);
    })
    .join("::");
  return `${prefix}-row-${cells ?? "empty"}`;
}

function renderMarks(text: string, marks: RichTextMark[] | undefined): ReactNode {
  if (!marks?.length) return text;
  let node: ReactNode = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        node = <strong>{node}</strong>;
        break;
      case "italic":
        node = <em>{node}</em>;
        break;
      case "underline":
        node = <span className="underline">{node}</span>;
        break;
      case "code":
        node = <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm">{node}</code>;
        break;
      case "strikethrough":
        node = <s>{node}</s>;
        break;
      default:
        break;
    }
  }
  return node;
}

function renderInline(node: RichTextNode, key: string): ReactNode {
  if (node.nodeType === "text") {
    return <span key={key}>{renderMarks(node.value ?? "", node.marks)}</span>;
  }
  if (node.nodeType === "hyperlink") {
    const uri = typeof node.data?.uri === "string" ? node.data.uri : "#";
    return (
      <a key={key} href={uri} className="text-primary underline">
        {node.content?.map((child, index) => renderInline(child, `${key}-${index}`))}
      </a>
    );
  }
  if (node.nodeType === "embedded-asset-inline") {
    const target = parseEmbedTarget(node.data);
    const meta = resolvedEmbedMeta(node);
    const alt = target?.altText?.trim() || meta?.label || "Asset";
    const url = meta?.imageUrl ?? meta?.url;
    if (url) {
      return <img key={key} src={url} alt={alt} className="inline-block max-h-8 align-middle" />;
    }
    return (
      <span key={key} className="rounded bg-muted px-1 text-xs">
        {alt}
      </span>
    );
  }
  if (node.nodeType === "embedded-entry-inline") {
    const meta = resolvedEmbedMeta(node);
    return (
      <span key={key} className="rounded bg-muted px-1 text-xs">
        {meta?.label ?? embedBlockLabel(node)}
      </span>
    );
  }
  return null;
}

function renderTableCell(node: RichTextNode, key: string): ReactNode {
  const inline = node.content?.map((child, index) => {
    if (child.nodeType === "paragraph") {
      return child.content?.map((inlineChild, inlineIndex) =>
        renderInline(inlineChild, `${key}-p-${index}-${inlineIndex}`),
      );
    }
    return renderBlock(child, `${key}-cell-${index}`);
  });
  return (
    <td key={key} className="border border-border px-3 py-2 align-top">
      {inline}
    </td>
  );
}

function renderBlock(node: RichTextNode, key: string): ReactNode {
  const inline = node.content?.map((child, index) => renderInline(child, `${key}-inline-${index}`));

  switch (node.nodeType) {
    case "paragraph":
      return (
        <p key={key} className="mb-3 last:mb-0">
          {inline}
        </p>
      );
    case "heading-1":
      return (
        <h1 key={key} className="mb-3 text-3xl font-bold">
          {inline}
        </h1>
      );
    case "heading-2":
      return (
        <h2 key={key} className="mb-2 text-2xl font-semibold">
          {inline}
        </h2>
      );
    case "heading-3":
      return (
        <h3 key={key} className="mb-2 text-xl font-semibold">
          {inline}
        </h3>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="mb-3 border-l-4 border-muted-foreground/30 pl-4 italic">
          {inline}
        </blockquote>
      );
    case "unordered-list":
      return (
        <ul key={key} className="mb-3 list-disc space-y-1 pl-5">
          {node.content
            ?.filter((child) => child.nodeType === "list-item")
            .map((item) => {
              const itemKey = listItemKey(key, item);
              return (
                <li key={itemKey}>
                  {item.content?.map((child, childIndex) =>
                    renderInline(child, `${itemKey}-${childIndex}`),
                  )}
                </li>
              );
            })}
        </ul>
      );
    case "ordered-list":
      return (
        <ol key={key} className="mb-3 list-decimal space-y-1 pl-5">
          {node.content
            ?.filter((child) => child.nodeType === "list-item")
            .map((item) => {
              const itemKey = listItemKey(key, item);
              return (
                <li key={itemKey}>
                  {item.content?.map((child, childIndex) =>
                    renderInline(child, `${itemKey}-${childIndex}`),
                  )}
                </li>
              );
            })}
        </ol>
      );
    case "hr":
      return <hr key={key} className="my-4 border-border" />;
    case "code-block":
      return (
        <pre key={key} className="mb-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">
          <code>{node.content?.map((child) => child.value ?? "").join("")}</code>
        </pre>
      );
    case "table":
      return (
        <div key={key} className="mb-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {node.content
                ?.filter((row) => row.nodeType === "table-row")
                .map((row) => {
                  const rowKey = tableRowKey(key, row);
                  return (
                    <tr key={rowKey}>
                      {row.content
                        ?.filter((cell) => cell.nodeType === "table-cell")
                        .map((cell, cellIndex) =>
                          renderTableCell(cell, `${rowKey}-cell-${cellIndex}`),
                        )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      );
    case "embedded-asset-block": {
      const target = parseEmbedTarget(node.data);
      const meta = resolvedEmbedMeta(node);
      if (!target) return null;
      const alt = target.altText?.trim() || meta?.label || "Embedded asset";
      const url = meta?.imageUrl ?? meta?.url;
      if (url) {
        return (
          <figure key={key} className="mb-3">
            <img src={url} alt={alt} className="max-w-full rounded-md" />
            <figcaption className="mt-1 text-sm text-muted-foreground">{alt}</figcaption>
          </figure>
        );
      }
      return (
        <figure
          key={key}
          className="mb-3 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-3 text-sm"
        >
          <figcaption className="font-medium">{alt}</figcaption>
          <p className="mt-1 text-xs text-muted-foreground">{target.documentId}</p>
        </figure>
      );
    }
    case "embedded-entry-block": {
      const target = parseEmbedTarget(node.data);
      const meta = resolvedEmbedMeta(node);
      if (!target) return null;
      return (
        <aside
          key={key}
          className="mb-3 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-3 text-sm"
        >
          <p className="font-medium">{meta?.label ?? embedBlockLabel(node)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{target.documentId}</p>
        </aside>
      );
    }
    case "embedded-video-block": {
      const target = parseEmbedTarget(node.data);
      const meta = resolvedEmbedMeta(node);
      if (!target) return null;
      const caption = target.caption?.trim() || meta?.label || "Video";
      const url = meta?.url ?? meta?.imageUrl;
      if (url) {
        return (
          <figure key={key} className="mb-3">
            <video controls src={url} className="max-w-full rounded-md" aria-label={caption}>
              <track kind="captions" />
            </video>
            <figcaption className="mt-1 text-sm text-muted-foreground">{caption}</figcaption>
          </figure>
        );
      }
      return (
        <figure
          key={key}
          className="mb-3 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-3 text-sm"
        >
          <figcaption className="font-medium">{caption}</figcaption>
          <p className="mt-1 text-xs text-muted-foreground">{target.documentId}</p>
        </figure>
      );
    }
    default:
      return (
        <div key={key} className="mb-3">
          {inline}
        </div>
      );
  }
}

export function RichTextRenderer({
  document,
  className,
}: Readonly<{ document: RichTextDocument; className?: string }>) {
  return (
    <div className={className}>
      {document.content.map((node, index) => renderBlock(node, `rt-block-${index}`))}
    </div>
  );
}
