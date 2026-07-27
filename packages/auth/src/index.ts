export { EDIT_MODE_FORBIDDEN_ERROR, isEditModeUrl } from "./edit-mode";
export { accessTokenFromRequest } from "./http/request-token";
export { orgIdFromTokenPayload } from "./jwt/claims";
export { decodeAccessTokenPayload, userIdFromAccessToken } from "./jwt/decode";
export {
  rolesFromTokenPayload,
  rolesFromZitadelJwt,
  zitadelProjectRolesClaimKey,
} from "./jwt/roles";

export {
  permissionsFromJwt,
  resolveAuthContextFromAccessToken,
  resolveIdentityFromTokenPayload,
  resolveRolesFromTokenPayload,
  rolesFromJwt,
  teamRoleFromJwt,
} from "./oidc/resolve-auth-context";
export { fetchUserinfo, rolesFromUserinfo } from "./oidc/userinfo";
/** @deprecated Use canDraft */
export {
  canDraft,
  canDraft as canDraftAtEdge,
  expandPermissions,
  expandPermissionsFromKeys,
  hasPermission,
  isPermissionKey,
  isPlatformRole,
  PERMISSIONS,
  type PermissionKey,
  PLATFORM_ROLES,
  type PlatformRole,
  primaryRoleFromKeys,
  primaryTeamRole,
  ROLE_PERMISSIONS,
} from "./permissions";
