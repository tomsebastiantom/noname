const DEFAULT_ZITADEL_ISSUER = "http://localhost:8080";

export function zitadelIssuer(): string {
  const configured = process.env.ZITADEL_ISSUER?.trim();
  return configured || DEFAULT_ZITADEL_ISSUER;
}
