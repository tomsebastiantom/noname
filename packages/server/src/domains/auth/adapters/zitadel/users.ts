import { randomBytes } from "node:crypto";
import {
  ConflictError,
  ServiceUnavailableError,
  ValidationError,
} from "../../../../shared/domain-error";
import { getManagementToken, v2Request } from "./management";

interface ZitadelUserRow {
  userId?: string;
  state?: string;
  human?: {
    profile?: { givenName?: string; familyName?: string; displayName?: string };
    email?: { email?: string; isVerified?: boolean };
  };
}

interface ListUsersResponse {
  result?: ZitadelUserRow[];
}

export interface OrgUserSummary {
  userId: string;
  email: string;
  displayName: string;
  state: string;
}

export async function findUserIdByEmail(orgId: string, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const body = await v2Request<ListUsersResponse>(orgId, "POST", "/users", {
    queries: [
      {
        emailQuery: {
          emailAddress: normalized,
          method: "TEXT_QUERY_METHOD_EQUALS",
        },
      },
    ],
    limit: 1,
  });

  const userId = body.result?.[0]?.userId?.trim();
  return userId || null;
}

export function passwordResetUrlTemplate(storeSlug: string): string {
  const port = process.env.CLIENT_DEV_PORT ?? "5173";
  const base = process.env.STORE_PUBLIC_BASE_URL ?? `http://${storeSlug}.localhost:${port}`;
  const origin = base.replace(/\/$/, "");
  return `${origin}/login?userID={{.UserID}}&code={{.Code}}&orgID={{.OrgID}}`;
}

export async function requestPasswordResetEmail(
  orgId: string,
  userId: string,
  urlTemplate: string,
): Promise<void> {
  await v2Request(orgId, "POST", `/users/${userId}/password_reset`, {
    sendLink: {
      notificationType: "NOTIFICATION_TYPE_Email",
      urlTemplate,
    },
  });
}

export async function setPasswordWithVerificationCode(
  orgId: string,
  userId: string,
  verificationCode: string,
  password: string,
): Promise<void> {
  await v2Request(orgId, "POST", `/users/${userId}/password`, {
    newPassword: {
      password,
      changeRequired: false,
    },
    verificationCode,
  });
}

export async function registerHumanUser(
  orgId: string,
  input: {
    email: string;
    password: string;
    givenName?: string;
    familyName?: string;
  },
): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  const localPart = email.split("@")[0] ?? "user";
  const givenName = input.givenName?.trim() || localPart;
  const familyName = input.familyName?.trim() || "User";

  const created = await v2Request<{ userId?: string }>(orgId, "POST", "/users/human", {
    organization: { orgId },
    username: email,
    profile: {
      givenName,
      familyName,
      displayName: `${givenName} ${familyName}`.trim(),
    },
    email: {
      email,
      isVerified: true,
    },
    password: {
      password: input.password,
      changeRequired: false,
    },
  });

  if (!created.userId) {
    throw new ServiceUnavailableError("ZITADEL did not return a user id");
  }
  return { userId: created.userId };
}

export async function listOrgUsers(orgId: string): Promise<OrgUserSummary[]> {
  const body = await v2Request<ListUsersResponse>(orgId, "POST", "/users", {
    queries: [],
    limit: 100,
    offset: 0,
  });

  return (body.result ?? [])
    .map((row) => {
      const userId = row.userId?.trim();
      const email = row.human?.email?.email?.trim().toLowerCase() ?? "";
      if (!userId || !email) return null;

      const profile = row.human?.profile;
      const displayName =
        profile?.displayName?.trim() ||
        [profile?.givenName, profile?.familyName].filter(Boolean).join(" ").trim() ||
        email;

      return {
        userId,
        email,
        displayName,
        state: row.state ?? "USER_STATE_UNSPECIFIED",
      };
    })
    .filter((row): row is OrgUserSummary => row !== null);
}

export async function inviteHumanUser(
  orgId: string,
  storeSlug: string,
  input: {
    email: string;
    givenName?: string;
    familyName?: string;
  },
): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email) {
    throw new ValidationError("email", "Email is required");
  }

  const existing = await findUserIdByEmail(orgId, email);
  if (existing) {
    throw new ConflictError("A user with this email already exists in this organization", {
      email,
    });
  }

  const tempPassword = randomBytes(24).toString("base64url");
  const { userId } = await registerHumanUser(orgId, {
    email,
    password: tempPassword,
    givenName: input.givenName,
    familyName: input.familyName,
  });

  await requestPasswordResetEmail(orgId, userId, passwordResetUrlTemplate(storeSlug));
  return { userId };
}

/** @internal test hook */
export { zitadelIssuer } from "./issuer";

/** @internal test hook */
export async function managementTokenForTests(): Promise<string> {
  return getManagementToken();
}
