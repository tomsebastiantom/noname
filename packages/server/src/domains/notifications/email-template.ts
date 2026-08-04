import type { Spec } from "@json-render/core";
import { renderToHtml, renderToPlainText } from "@json-render/react-email";
import { coerceScalarString } from "@noname/shared";
import type { ContentDocumentService } from "../documents/ports";

export const NOTIFICATION_EMAIL_CONTENT_TYPE = "notification_email";

export type NotificationEmailCategory = "transactional" | "agent" | "marketing";

export interface LoadedNotificationEmail {
  templateKey: string;
  subject: string;
  spec: Spec;
  category: NotificationEmailCategory;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TEMPLATE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isEmailSpec(value: unknown): value is Spec {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.root === "string" && record.elements !== null && typeof record.elements === "object";
}

export function parseNotificationEmailEntry(
  data: Record<string, unknown>,
): LoadedNotificationEmail | null {
  const templateKey = coerceScalarString(data.template_key).trim().toLowerCase();
  if (!templateKey || !TEMPLATE_KEY_PATTERN.test(templateKey)) {
    return null;
  }

  const subject = coerceScalarString(data.subject).trim();
  if (!subject || !isEmailSpec(data.spec)) {
    return null;
  }

  const categoryRaw = coerceScalarString(data.category, "transactional").trim().toLowerCase();
  const category: NotificationEmailCategory =
    categoryRaw === "agent" || categoryRaw === "marketing" ? categoryRaw : "transactional";

  return { templateKey, subject, spec: data.spec, category };
}

export async function loadPublishedNotificationEmail(
  content: Pick<ContentDocumentService, "findById" | "findByType" | "resolve">,
  orgId: string,
  templateId: string,
  locale = "en-US",
): Promise<LoadedNotificationEmail | null> {
  const trimmed = templateId.trim();
  if (!trimmed) return null;

  let row =
    UUID_PATTERN.test(trimmed) ? await content.findById(orgId, trimmed) : null;

  if (!row || row.type !== NOTIFICATION_EMAIL_CONTENT_TYPE || row.status !== "published") {
    const entries = await content.findByType(orgId, NOTIFICATION_EMAIL_CONTENT_TYPE);
    const key = trimmed.toLowerCase();
    row =
      entries.find(
        (entry) =>
          entry.status === "published" &&
          String(entry.data.template_key ?? "")
            .trim()
            .toLowerCase() === key,
      ) ?? null;
  }

  if (!row || row.status !== "published") {
    return null;
  }

  const resolved = await content.resolve(orgId, NOTIFICATION_EMAIL_CONTENT_TYPE, row.id, locale);
  if (!resolved) return null;

  return parseNotificationEmailEntry(resolved);
}

export async function renderNotificationEmail(
  template: LoadedNotificationEmail,
  variables: Record<string, string>,
): Promise<{ subject: string; html: string; text: string }> {
  const state = { ...variables };
  const html = await renderToHtml(template.spec, { state });
  const text = await renderToPlainText(template.spec, { state });
  return { subject: template.subject, html, text };
}
