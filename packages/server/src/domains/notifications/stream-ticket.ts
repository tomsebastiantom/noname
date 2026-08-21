import crypto from "node:crypto";
import { ServiceUnavailableError } from "../../shared/domain-error";

const TICKET_TTL_SEC = 60;

type StreamTicketPayload = {
  userId: string;
  orgId: string;
  exp: number;
};

function ticketSecret(): string {
  const secret = process.env.WORKER_SERVER_SECRET?.trim();
  if (!secret) {
    throw new ServiceUnavailableError("WORKER_SERVER_SECRET required for stream tickets");
  }
  return secret;
}

export function mintStreamTicket(
  userId: string,
  orgId: string,
): { ticket: string; expiresIn: number } {
  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SEC;
  const payload = Buffer.from(
    JSON.stringify({ userId, orgId, exp } satisfies StreamTicketPayload),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  return { ticket: `${payload}.${sig}`, expiresIn: TICKET_TTL_SEC };
}

export function verifyStreamTicket(ticket: string): StreamTicketPayload | null {
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
    ) as StreamTicketPayload;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.orgId !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
