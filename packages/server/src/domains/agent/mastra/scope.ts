import type { AuthorizationPort, AuthSubject } from "../../auth/authorization-port";

function agentSubject(agentSlug: string): AuthSubject {
  return { type: "Agent", id: agentSlug };
}

/** Keto view check for a folder (Collection slug). */
export async function agentCanViewCollection(
  authorization: AuthorizationPort,
  agentSlug: string,
  folderSlug: string,
): Promise<boolean> {
  return authorization.check({
    subject: agentSubject(agentSlug),
    permission: "view",
    namespace: "Collection",
    objectId: folderSlug,
  });
}

/** Keto view check — folder first, then direct Document grant. */
export async function agentCanViewDocument(
  authorization: AuthorizationPort,
  agentSlug: string,
  doc: { id: string; collectionSlug: string | null },
): Promise<boolean> {
  if (doc.collectionSlug) {
    const onFolder = await authorization.check({
      subject: agentSubject(agentSlug),
      permission: "view",
      namespace: "Collection",
      objectId: doc.collectionSlug,
    });
    if (onFolder) return true;
  }

  return authorization.check({
    subject: agentSubject(agentSlug),
    permission: "view",
    namespace: "Document",
    objectId: doc.id,
  });
}

/** Keto edit check — folder first, then direct Document grant. */
export async function agentCanEditDocument(
  authorization: AuthorizationPort,
  agentSlug: string,
  doc: { id: string; collectionSlug: string | null },
): Promise<boolean> {
  if (doc.collectionSlug) {
    const onFolder = await authorization.check({
      subject: agentSubject(agentSlug),
      permission: "edit",
      namespace: "Collection",
      objectId: doc.collectionSlug,
    });
    if (onFolder) return true;
  }

  return authorization.check({
    subject: agentSubject(agentSlug),
    permission: "edit",
    namespace: "Document",
    objectId: doc.id,
  });
}
