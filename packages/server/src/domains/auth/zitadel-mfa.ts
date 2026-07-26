const ISSUER = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";

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
  const res = await fetch(`${ISSUER}${path}`, {
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
