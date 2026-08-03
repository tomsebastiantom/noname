function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function ketoReadUrl(): string {
  return ketoBaseUrl(process.env.KETO_READ_URL?.trim() || "localhost:4466");
}

export function ketoWriteUrl(): string {
  return ketoBaseUrl(process.env.KETO_WRITE_URL?.trim() || "localhost:4467");
}

function ketoBaseUrl(hostOrUrl: string): string {
  if (hostOrUrl.startsWith("http://") || hostOrUrl.startsWith("https://")) {
    return hostOrUrl.replace(/\/$/, "");
  }
  const scheme = envFlag("KETO_GRPC_INSECURE") ? "http" : "https";
  return `${scheme}://${hostOrUrl.replace(/\/$/, "")}`;
}
