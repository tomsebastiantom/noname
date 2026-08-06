import { getAccessToken, sessionUserEmail } from "../../auth/session";
import { COLLAB_HUMAN_FALLBACK } from "./collab-peer-display";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payloadPart = token.split(".")[1];
  if (!payloadPart) return null;
  try {
    let base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const json = atob(base64);
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Human label for layout/rich-text collab presence (never raw Zitadel sub). */
export function collabHumanDisplayName(): string {
  const email = sessionUserEmail();
  if (email) {
    const local = email.split("@")[0]?.trim();
    return local || email;
  }

  const token = getAccessToken();
  if (token) {
    const payload = decodeJwtPayload(token);
    const preferred = payload?.preferred_username;
    if (typeof preferred === "string" && preferred.trim()) {
      return preferred.trim();
    }
    const name = payload?.name;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }

  return COLLAB_HUMAN_FALLBACK;
}
