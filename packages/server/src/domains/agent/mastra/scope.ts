import type { AuthorizationPort, AuthSubject } from "../../auth/authorization-port";
import type { AgentRunContext } from "./context";

function agentSubject(agentSlug: string): AuthSubject {
  return { type: "Agent", id: agentSlug };
}

function userSubject(userId: string): AuthSubject {
  return { type: "User", id: userId };
}

async function userCanViewDocument(
  authorization: AuthorizationPort,
  userId: string,
  doc: { id: string; collectionSlug: string | null },
): Promise<boolean> {
  if (doc.collectionSlug) {
    const onFolder = await authorization.check({
      subject: userSubject(userId),
      permission: "view",
      namespace: "Collection",
      objectId: doc.collectionSlug,
    });
    if (onFolder) return true;
  }
  return authorization.check({
    subject: userSubject(userId),
    permission: "view",
    namespace: "Document",
    objectId: doc.id,
  });
}

async function userCanEditDocument(
  authorization: AuthorizationPort,
  userId: string,
  doc: { id: string; collectionSlug: string | null },
): Promise<boolean> {
  if (doc.collectionSlug) {
    const onFolder = await authorization.check({
      subject: userSubject(userId),
      permission: "edit",
      namespace: "Collection",
      objectId: doc.collectionSlug,
    });
    if (onFolder) return true;
  }
  return authorization.check({
    subject: userSubject(userId),
    permission: "edit",
    namespace: "Document",
    objectId: doc.id,
  });
}

/** Keto view check for a folder (Collection slug), with owner delegation. */
export async function agentCanViewCollection(
  authorization: AuthorizationPort,
  agentSlug: string,
  folderSlug: string,
  onBehalfOf?: string,
): Promise<boolean> {
  const onAgent = await authorization.check({
    subject: agentSubject(agentSlug),
    permission: "view",
    namespace: "Collection",
    objectId: folderSlug,
  });
  if (onAgent) return true;
  if (!onBehalfOf) return false;
  return authorization.check({
    subject: userSubject(onBehalfOf),
    permission: "view",
    namespace: "Collection",
    objectId: folderSlug,
  });
}

/** Task was started from the visual editor targeting this layout document. */
export function isEditorScopedLayout(
  runContext: Pick<AgentRunContext, "targetLayoutDocumentId"> | null,
  layoutDocumentId: string,
): boolean {
  return Boolean(
    runContext?.targetLayoutDocumentId && runContext.targetLayoutDocumentId === layoutDocumentId,
  );
}

/** Agent view, then agent owner (onBehalfOf) when orchestrating in the editor. */
export async function agentCanViewDocument(
  authorization: AuthorizationPort,
  agentSlug: string,
  doc: { id: string; collectionSlug: string | null },
  onBehalfOf?: string,
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

  const onDocument = await authorization.check({
    subject: agentSubject(agentSlug),
    permission: "view",
    namespace: "Document",
    objectId: doc.id,
  });
  if (onDocument) return true;

  if (onBehalfOf) {
    return userCanViewDocument(authorization, onBehalfOf, doc);
  }
  return false;
}

/** Agent edit, then agent owner (onBehalfOf) when orchestrating in the editor. */
export async function agentCanEditDocument(
  authorization: AuthorizationPort,
  agentSlug: string,
  doc: { id: string; collectionSlug: string | null },
  onBehalfOf?: string,
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

  const onDocument = await authorization.check({
    subject: agentSubject(agentSlug),
    permission: "edit",
    namespace: "Document",
    objectId: doc.id,
  });
  if (onDocument) return true;

  if (onBehalfOf) {
    return userCanEditDocument(authorization, onBehalfOf, doc);
  }
  return false;
}
