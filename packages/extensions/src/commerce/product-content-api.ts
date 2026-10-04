import { getPublishableKey } from "./cart";

export type PublishedContentItem = {
  id: string;
  data: Record<string, unknown>;
};

export type PublishedContentPage = {
  items: PublishedContentItem[];
  locale: string;
  limit: number;
  offset: number;
  nextOffset: number | null;
};

export async function fetchPublishedContent(input: {
  type: string;
  locale?: string;
  collectionSlug?: string | null;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<PublishedContentPage> {
  const publishableKey = await getPublishableKey();
  if (!publishableKey) throw new Error("Storefront content is unavailable");

  const params = new URLSearchParams();
  if (input.locale) params.set("locale", input.locale);
  if (input.collectionSlug) params.set("collection", input.collectionSlug);
  if (input.query?.trim()) params.set("q", input.query.trim());
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.offset !== undefined) params.set("offset", String(input.offset));

  const encodedParams = params.toString();
  const query = encodedParams ? `?${encodedParams}` : "";
  const response = await fetch(
    `/api/storefront/content/${encodeURIComponent(input.type)}${query}`,
    { headers: { "x-publishable-key": publishableKey } },
  );
  const body = (await response.json()) as { data?: PublishedContentPage; error?: string };
  if (!response.ok || !body.data) {
    throw new Error(body.error ?? `Could not load content (${response.status})`);
  }
  return body.data;
}
