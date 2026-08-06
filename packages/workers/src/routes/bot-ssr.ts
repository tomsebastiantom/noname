/** Bot detection + lightweight HTML from json-render layout (I1 — no full React SSR in worker). */

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

function collectTextStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 10 || out.length > 40) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && trimmed.length <= 500 && !trimmed.startsWith("$")) {
      out.push(trimmed);
    }
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const v of Object.values(value as Record<string, unknown>)) {
    collectTextStrings(v, out, depth + 1);
  }
}

export interface StorefrontSeo {
  title: string;
  description: string;
  snippets: string[];
}

/** Pull title/description-like strings from a resolved layout spec. */
export function extractSeoFromLayout(layout: Record<string, unknown> | null): StorefrontSeo {
  if (!layout) {
    return { title: "Store", description: "", snippets: [] };
  }

  const strings: string[] = [];
  const elements = layout.elements;
  if (elements && typeof elements === "object" && !Array.isArray(elements)) {
    for (const element of Object.values(elements as Record<string, unknown>)) {
      if (!element || typeof element !== "object") continue;
      const record = element as { props?: unknown };
      collectTextStrings(record.props, strings);
    }
  }
  collectTextStrings(layout, strings);

  const unique = [...new Set(strings)];
  const title = unique[0] ?? "Store";
  const description = unique.slice(1, 4).join(" · ").slice(0, 300);

  return { title, description, snippets: unique.slice(0, 12) };
}

export function renderBotHtml(seo: StorefrontSeo, siteLabel: string): string {
  const title = escapeHtml(seo.title || siteLabel);
  const description = escapeHtml(seo.description || seo.title || siteLabel);
  const body = seo.snippets
    .slice(0, 8)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");

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
