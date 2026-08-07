import crypto from "node:crypto";

const TICKET_TTL_SEC = 60;

export type CollabTicketPayload = {
  userId: string;
  orgId: string;
  layoutDocumentId: string;
  exp: number;
  peerKind?: "human" | "agent";
  displayName?: string;
};

export type MintCollabTicketOptions = {
  peerKind?: "human" | "agent";
  displayName?: string;
};

function ticketSecret(): string {
  const secret = process.env.WORKER_SERVER_SECRET?.trim();
  if (!secret) {
    throw new Error("WORKER_SERVER_SECRET required for collab tickets");
  }
  return secret;
}

export function mintCollabTicket(
  userId: string,
  orgId: string,
  layoutDocumentId: string,
  options: MintCollabTicketOptions = {},
): { ticket: string; expiresIn: number } {
  const displayName = options.displayName?.trim();
  if (!displayName) {
    throw new Error("displayName required for collab tickets");
  }

  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL_SEC;
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      orgId,
      layoutDocumentId,
      exp,
      ...(options.peerKind ? { peerKind: options.peerKind } : {}),
      ...(displayName ? { displayName } : {}),
    } satisfies CollabTicketPayload),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
  return { ticket: `${payload}.${sig}`, expiresIn: TICKET_TTL_SEC };
}

export function verifyCollabTicket(ticket: string): CollabTicketPayload | null {
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
    ) as CollabTicketPayload;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.orgId !== "string" ||
      typeof parsed.layoutDocumentId !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (
      parsed.peerKind !== undefined &&
      parsed.peerKind !== "human" &&
      parsed.peerKind !== "agent"
    ) {
      return null;
    }
    if (parsed.displayName !== undefined && typeof parsed.displayName !== "string") {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const peerKind = parsed.peerKind ?? "human";
    if (!parsed.displayName?.trim()) {
      return null;
    }
    if (peerKind !== "human" && peerKind !== "agent") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
