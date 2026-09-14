// Stable import surface for packages/seeding — do not deep-import server domain internals from seed profiles.

export { upsertUserTeamRole } from "./domains/auth/adapters/zitadel/authorizations";
export { loginWithCredentials } from "./domains/auth/adapters/zitadel/client";
export { findUserIdByEmail, registerHumanUser } from "./domains/auth/adapters/zitadel/users";
