import { ServiceUnavailableError } from "../../../shared/domain-error";
import type { SecretStorePort } from "../ports";

/** Reads platform keys from env when Vault is not configured (org BYOK unavailable). */
export function createEnvFallbackSecretStore(): SecretStorePort {
  return {
    async putOrgSecret(): Promise<void> {
      throw new ServiceUnavailableError("Vault not configured — cannot store org secrets");
    },

    async getOrgSecret(): Promise<Record<string, string> | null> {
      return null;
    },

    async hasOrgSecret(): Promise<boolean> {
      return false;
    },

    async getPlatformSecret(name: string): Promise<string | null> {
      if (name === "openai_api_key") return process.env.OPENAI_API_KEY ?? null;
      if (name === "anthropic_api_key") return process.env.ANTHROPIC_API_KEY ?? null;
      if (name === "resend_api_key") return process.env.RESEND_API_KEY ?? null;
      return null;
    },
  };
}
