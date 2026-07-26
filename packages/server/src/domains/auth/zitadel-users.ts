import { getManagementToken, v2Request } from "./zitadel-management";

const ISSUER = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";

interface ListUsersResponse {
  result?: Array<{ userId?: string }>;
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
    throw new Error("ZITADEL did not return a user id");
  }
  return { userId: created.userId };
}

/** @internal test hook */
export function zitadelIssuer(): string {
  return ISSUER;
}

/** @internal test hook */
export async function managementTokenForTests(): Promise<string> {
  return getManagementToken();
}
