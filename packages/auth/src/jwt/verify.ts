/**
 * Portable JWT access-token verification (JOSE RS* / ES*) built on WebCrypto.
 *
 * Runs unchanged in Node (API server) and Cloudflare Workers (edge). Key
 * resolution is injected so each runtime supplies its own JWKS cache.
 *
 * Rationale: `decodeAccessTokenPayload` only base64-decodes. Anything that
 * derives identity or permissions from a token must verify it first, at
 * whichever layer is receiving the request. See `ADR-0004`.
 */

export interface AccessTokenHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

export type JwkResolver = (
  header: AccessTokenHeader,
) => Promise<JsonWebKey | null> | JsonWebKey | null;

export interface VerifyAccessTokenOptions {
  /** Expected `iss`. Required. */
  issuer: string;
  /** Expected `aud`. When omitted or empty, `aud` is not checked (local dev). */
  audience?: string;
  resolveKey: JwkResolver;
  /** Clock-skew tolerance in seconds. Defaults to 60. */
  clockToleranceSec?: number;
  now?: () => number;
}

const RS_ALGS: Record<string, string> = {
  RS256: "SHA-256",
  RS384: "SHA-384",
  RS512: "SHA-512",
};

const ES_ALGS: Record<string, string> = {
  ES256: "SHA-256",
  ES384: "SHA-384",
  ES512: "SHA-512",
};

function decodeBase64UrlToBytes(part: string): Uint8Array | null {
  try {
    let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Minimal structural view of WebCrypto's `subtle`, so this module compiles
 * against the Node lib, the DOM lib, and `@cloudflare/workers-types` alike.
 */
interface SubtleCryptoLike {
  importKey(
    format: string,
    keyData: JsonWebKey,
    algorithm: Record<string, unknown>,
    extractable: boolean,
    keyUsages: string[],
  ): Promise<unknown>;
  verify(
    algorithm: Record<string, unknown>,
    key: unknown,
    signature: Uint8Array,
    data: Uint8Array,
  ): Promise<boolean>;
}

function getSubtleCrypto(): SubtleCryptoLike | null {
  const candidate = (globalThis as unknown as { crypto?: { subtle?: SubtleCryptoLike } }).crypto;
  return candidate?.subtle ?? null;
}

function decodeJsonPart(part: string): Record<string, unknown> | null {
  const bytes = decodeBase64UrlToBytes(part);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function audienceMatches(aud: unknown, expected: string): boolean {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.some((entry) => entry === expected);
  return false;
}

function numericDate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

/**
 * Verify signature, issuer, audience, and time claims.
 * Returns the verified payload, or `null` for any failure (fail closed).
 */
export async function verifyAccessToken(
  token: string,
  options: VerifyAccessTokenOptions,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodeJsonPart(headerPart);
  const payload = decodeJsonPart(payloadPart);
  if (!header || !payload) return null;

  const alg = typeof header.alg === "string" ? header.alg : "";
  if (alg === "none") return null;

  const rsHash = RS_ALGS[alg];
  const esHash = ES_ALGS[alg];
  if (!rsHash && !esHash) return null;

  const kid = typeof header.kid === "string" ? header.kid : undefined;
  let jwk: JsonWebKey | null = null;
  try {
    jwk = await options.resolveKey({
      alg,
      kid,
      typ: typeof header.typ === "string" ? header.typ : undefined,
    });
  } catch {
    jwk = null;
  }
  if (!jwk) return null;

  const signature = decodeBase64UrlToBytes(signaturePart);
  if (!signature) return null;
  const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`);

  const subtle = getSubtleCrypto();
  if (!subtle) return null;

  let verified = false;
  try {
    const cryptoKey = await subtle.importKey(
      "jwk",
      jwk,
      rsHash
        ? { name: "RSASSA-PKCS1-v1_5", hash: rsHash }
        : { name: "ECDSA", namedCurve: String(jwk.crv ?? "P-256") },
      false,
      ["verify"],
    );
    verified = await subtle.verify(
      rsHash ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: esHash },
      cryptoKey,
      signature,
      signingInput,
    );
  } catch {
    return null;
  }
  if (!verified) return null;

  if (payload.iss !== options.issuer) return null;
  if (options.audience) {
    if (!audienceMatches(payload.aud, options.audience)) return null;
  }

  const now = options.now ? options.now() : Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSec ?? 60;

  const exp = numericDate(payload.exp);
  if (exp === null || exp + tolerance < now) return null;

  const nbf = numericDate(payload.nbf);
  if (nbf !== null && nbf - tolerance > now) return null;

  return payload;
}
