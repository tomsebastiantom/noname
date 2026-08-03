export { EDIT_MODE_FORBIDDEN_ERROR, isEditModeUrl } from "./edit-mode";
export {
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
} from "./fetch-with-timeout";
export { accessTokenFromRequest } from "./http/request-token";
export { orgIdFromTokenPayload } from "./jwt/claims";
export { decodeAccessTokenPayload, userIdFromAccessToken } from "./jwt/decode";
export {
  rolesFromTokenPayload,
  zitadelProjectRolesClaimKey,
} from "./jwt/roles";

export {
  permissionsFromJwt,
  resolveAuthContextFromAccessToken,
  resolveIdentityFromTokenPayload,
  resolveRolesFromTokenPayload,
  rolesFromJwt,
  staffUiRoleFromJwt,
  /** @deprecated use staffUiRoleFromJwt */
  teamRoleFromJwt,
} from "./oidc/resolve-auth-context";
export { fetchUserinfo, rolesFromUserinfo } from "./oidc/userinfo";
export {
  canDraft,
  canDraftFromPermissions,
  expandPermissions,
  expandPermissionsFromKeys,
  hasPermission,
  isPermissionKey,
  isPlatformRole,
  isStaffRole,
  PERMISSIONS,
  type PermissionKey,
  PLATFORM_ROLES,
  type PlatformRole,
  primaryRoleFromKeys,
  primaryTeamRole,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  type StaffRole,
} from "./permissions";
export {
  ACCESS_MANAGER_ASSIGNABLE_ROLES,
  type AccessManagerAssignableRole,
  canAssignRole,
  isAccessManagerAssignableRole,
} from "./role-assignment";
export {
  canJoinTeamEditorSlot,
  canJoinTeamPublisherSlot,
} from "./team-slot-validation";
