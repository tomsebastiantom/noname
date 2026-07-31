import { zitadelIssuer } from "./issuer";
import { v2Request } from "./management";

export interface TotpRegistrationStart {
  uri: string;
  secret: string;
}

async function userV2Request<T>(
  userToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${zitadelIssuer()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }

  const err = parsed as { message?: string };
  if (!res.ok) {
    throw new Error(err.message ?? `ZITADEL ${path} failed (${res.status})`);
  }

  return parsed as T;
}

/** Start TOTP enrollment — requires the end-user access token. */
export async function startTotpRegistration(
  userToken: string,
  userId: string,
): Promise<TotpRegistrationStart> {
  const body = await userV2Request<{ uri?: string; secret?: string }>(
    userToken,
    "POST",
    `/v2/users/${encodeURIComponent(userId)}/totp`,
    {},
  );

  const uri = body.uri?.trim();
  const secret = body.secret?.trim();
  if (!uri || !secret) {
    throw new Error("ZITADEL did not return TOTP registration details");
  }

  return { uri, secret };
}

/** Confirm TOTP enrollment with a code from the authenticator app. */
export async function verifyTotpRegistration(
  userToken: string,
  userId: string,
  code: string,
): Promise<void> {
  await userV2Request(userToken, "POST", `/v2/users/${encodeURIComponent(userId)}/totp/verify`, {
    code: code.trim(),
  });
}

/** Whether the user has TOTP enrolled (management/service token). */
export async function userHasTotpFactor(orgId: string, userId: string): Promise<boolean> {
  try {
    const body = await v2Request<{ result?: Array<{ type?: string; state?: string }> }>(
      orgId,
      "POST",
      `/users/${encodeURIComponent(userId)}/authentication_factors/_search`,
      { query: { offset: "0", limit: "20" } },
    );
    return (body.result ?? []).some((factor) => {
      const record = factor as { type?: string; state?: string; otp?: unknown };
      const type = (record.type ?? "").toUpperCase();
      const state = (record.state ?? "").toUpperCase();
      const isTotp = Boolean(record.otp) || type.includes("TOTP") || type.includes("OTP");
      const ready = !state || state.includes("READY") || state.includes("ACTIVE");
      return isTotp && ready;
    });
  } catch {
    return false;
  }
}
