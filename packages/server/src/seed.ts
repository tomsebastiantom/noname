// Stable import surface for scripts/seed — do not deep-import server domain internals from scripts.

export { upsertUserTeamRole } from "./domains/auth/adapters/zitadel/authorizations";
export { loginWithCredentials } from "./domains/auth/adapters/zitadel/client";
export { findUserIdByEmail, registerHumanUser } from "./domains/auth/adapters/zitadel/users";
