/** Bot detection + lightweight HTML from json-render layout (I1 — no full React SSR in worker). */

import {
  isRichTextDocument,
  richTextToHtml,
  richTextToPlainText,
} from "@noname/documents/richtext-html";

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|twitterbot|linkedinbot|preview|gptbot|anthropic-ai/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent?.trim()) return false;
  return BOT_UA.test(userAgent);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function collectSeoContent(
  value: unknown,
  metaStrings: string[],
  layoutSnippets: string[],
  richHtml: string[],
  depth = 0,
): void {
  if (depth > 12 || metaStrings.length > 40) return;

  if (isRichTextDocument(value)) {
    const text = richTextToPlainText(value);
    if (text.length >= 2) metaStrings.push(text);
    const html = richTextToHtml(value).trim();
    if (html) richHtml.push(html);
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && trimmed.length <= 500 && !trimmed.startsWith("$")) {
      metaStrings.push(trimmed);
      layoutSnippets.push(trimmed);
    }
    return;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const v of Object.values(value as Record<string, unknown>)) {
    collectSeoContent(v, metaStrings, layoutSnippets, richHtml, depth + 1);
  }
}

export interface StorefrontSeo {
  title: string;
  description: string;
  snippets: string[];
  /** Pre-rendered safe HTML from inline richText CMS fields (already escaped). */
  richHtml: string[];
}

/** Pull title/description-like strings from a resolved layout spec. */
export function extractSeoFromLayout(layout: Record<string, unknown> | null): StorefrontSeo {
  if (!layout) {
    return { title: "Store", description: "", snippets: [], richHtml: [] };
  }

  const metaStrings: string[] = [];
  const layoutSnippets: string[] = [];
  const richHtml: string[] = [];
  const elements = layout.elements;
  if (elements && typeof elements === "object" && !Array.isArray(elements)) {
    for (const element of Object.values(elements as Record<string, unknown>)) {
      if (!element || typeof element !== "object") continue;
      const record = element as { props?: unknown };
      collectSeoContent(record.props, metaStrings, layoutSnippets, richHtml);
    }
  }
  collectSeoContent(layout, metaStrings, layoutSnippets, richHtml);

  const uniqueMeta = [...new Set(metaStrings)];
  const title = uniqueMeta[0] ?? "Store";
  const description = uniqueMeta.slice(1, 4).join(" · ").slice(0, 300);

  return {
    title,
    description,
    snippets: [...new Set(layoutSnippets)].slice(0, 12),
    richHtml: richHtml.slice(0, 8),
  };
}

export function renderBotHtml(seo: StorefrontSeo, siteLabel: string): string {
  const title = escapeHtml(seo.title || siteLabel);
  const description = escapeHtml(seo.description || seo.title || siteLabel);
  const richBlocks = seo.richHtml.join("\n");
  const plainBlocks = seo.snippets
    .slice(0, 8)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
  const body = [richBlocks, plainBlocks].filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="robots" content="index,follow" />
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}
