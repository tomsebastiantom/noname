/**
 * Credential lifecycle actions — audit phase B.
 *
 * Every other action in the stream is "an actor did something to a tenant". These are "the set of actors itself
 * changed": a service account was created, a role was granted, a key was added or removed, an account was disabled.
 *
 * They matter because the actor of a wave is a credential, and `evidence_audit_events` previously had no record of
 * how that credential came to hold platform-wide authority. Reconstructing "who could have moved 40 tenants last
 * Tuesday" required the IdP's audit log, not ours.
 */
export const CREDENTIAL_ACTIONS = {
  CREATED: "platform.credential.created",
  GRANTED: "platform.credential.granted",
  REVOKED: "platform.credential.revoked",
  KEY_ADDED: "platform.credential.key_added",
  KEY_REMOVED: "platform.credential.key_removed",
  DEACTIVATED: "platform.credential.deactivated",
} as const;

export type CredentialAction = (typeof CREDENTIAL_ACTIONS)[keyof typeof CREDENTIAL_ACTIONS];

export const CREDENTIAL_ACTION_VALUES: readonly string[] = Object.values(CREDENTIAL_ACTIONS);

/** Subject type used for every credential row, so one filter finds the whole lifecycle. */
export const CREDENTIAL_SUBJECT_TYPE = "platform.service_account";

export type CredentialEventInput = {
  action: CredentialAction;
  /** Service-account id in ZITADEL (stable across renames). */
  accountId: string;
  accountName?: string;
  role?: string;
  projectId?: string;
  /** Key id only — never the private key or its fingerprint. */
  keyId?: string;
  actorType: "user" | "service" | "system";
  actorId: string;
  reason?: string;
};
