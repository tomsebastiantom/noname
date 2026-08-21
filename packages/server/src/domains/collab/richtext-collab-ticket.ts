import crypto from "node:crypto";
import { ServiceUnavailableError, ValidationError } from "../../shared/domain-error";

const TICKET_TTL_SEC = 60;
const MAX_FIELD_KEY = 64;
const MAX_LOCALE = 32;

export type RichTextCollabTicketPayload = {
  userId: string;
  orgId: string;
  contentDocumentId: string;
  fieldKey: string;
  locale: string;
  exp: number;
};

function ticketSecret(): string {
  const secret = process.env.WORKER_SERVER_SECRET?.trim();
  if (!secret) {
    throw new ServiceUnavailableError("WORKER_SERVER_SECRET required for collab tickets");
  }
  return secret;
}

export function normalizeRichTextFieldKey(fieldKey: string): string | null {
  const trimmed = fieldKey.trim();
  if (!trimmed || trimmed.length > MAX_FIELD_KEY) return null;
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizeRichTextLocale(locale: string): string | null {
  const trimmed = locale.trim();
  if (!trimmed || trimmed.length > MAX_LOCALE) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function buildRichTextCollabRoomName(
  orgId: string,
  contentDocumentId: string,
  fieldKey: string,
  locale: string,
): string {
  return `${orgId}:${contentDocumentId}:${fieldKey}:${locale}`;
}

export function parseRichTextCollabRoomName(
  roomName: string,
): Omit<RichTextCollabTicketPayload, "userId" | "exp"> | null {
  const parts = roomName.trim().split(":");
  if (parts.length !== 4) return null;
  const orgId = parts[0];
  const contentDocumentId = parts[1];
  const fieldKey = parts[2];
  const locale = parts[3];
  if (!orgId || !contentDocumentId || !fieldKey || !locale) return null;
  const normalizedFieldKey = normalizeRichTextFieldKey(fieldKey);
  const normalizedLocale = normalizeRichTextLocale(locale);
  if (!normalizedFieldKey || !normalizedLocale) return null;
  return {
    orgId,
    contentDocumentId,
    fieldKey: normalizedFieldKey,
    locale: normalizedLocale,
  };
}

export function mintRichTextCollabTicket(
  userId: string,
  orgId: string,
  contentDocumentId: string,
  fieldKey: string,
  locale: string,
): { ticket: string; expiresIn: number; roomName: string } {
  const normalizedFieldKey = normalizeRichTextFieldKey(fieldKey);
  const normalizedLocale = normalizeRichTextLocale(locale);
  if (!normalizedFieldKey || !normalizedLocale) {
    throw new ValidationError("field", "invalid rich text collab field or locale");
  }

  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SEC;
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      orgId,
      contentDocumentId,
      fieldKey: normalizedFieldKey,
      locale: normalizedLocale,
      exp,
    } satisfies RichTextCollabTicketPayload),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  const roomName = buildRichTextCollabRoomName(
    orgId,
    contentDocumentId,
    normalizedFieldKey,
    normalizedLocale,
  );
  return { ticket: `${payload}.${sig}`, expiresIn: TICKET_TTL_SEC, roomName };
}

export function verifyRichTextCollabTicket(ticket: string): RichTextCollabTicketPayload | null {
  const trimmed = ticket.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = crypto.createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as RichTextCollabTicketPayload;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.orgId !== "string" ||
      typeof parsed.contentDocumentId !== "string" ||
      typeof parsed.fieldKey !== "string" ||
      typeof parsed.locale !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const fieldKey = normalizeRichTextFieldKey(parsed.fieldKey);
    const locale = normalizeRichTextLocale(parsed.locale);
    if (!fieldKey || !locale) return null;
    return { ...parsed, fieldKey, locale };
  } catch {
    return null;
  }
}
