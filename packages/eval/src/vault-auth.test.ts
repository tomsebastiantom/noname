import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearVaultTokenCache,
  getVaultToken,
  type VaultAuthConfig,
  vaultAuthFromEnv,
} from "./vault-auth";

afterEach(() => {
  clearVaultTokenCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("vaultAuthFromEnv", () => {
  it("requires an explicit mode", () => {
    expect(() => vaultAuthFromEnv({})).toThrow(/VAULT_AUTH_MODE is required/);
  });

  it("accepts token mode outside production", () => {
    const config = vaultAuthFromEnv({ VAULT_AUTH_MODE: "token", VAULT_TOKEN: "dev" });
    expect(config).toEqual({ mode: "token", token: "dev" });
  });

  it("rejects token mode in production", () => {
    expect(() =>
      vaultAuthFromEnv({ NODE_ENV: "production", VAULT_AUTH_MODE: "token", VAULT_TOKEN: "dev" }),
    ).toThrow(/local development only/);
  });

  it("parses per-tenant AppRole credentials", () => {
    const config = vaultAuthFromEnv({
      VAULT_AUTH_MODE: "approle",
      VAULT_ADDR: "http://vault:8200",
      VAULT_APPROLE_CREDENTIALS: JSON.stringify({
        "org-a": { roleId: "role-a", secretId: "secret-a" },
        "org-b": { roleId: "role-b", secretId: "secret-b" },
      }),
    });
    expect(config).toMatchObject({
      mode: "approle",
      credentials: {
        "org-a": { roleId: "role-a", secretId: "secret-a" },
        "org-b": { roleId: "role-b", secretId: "secret-b" },
      },
    });
  });
});

describe("getVaultToken", () => {
  it("returns the dev token", async () => {
    await expect(getVaultToken("org-a", { mode: "token", token: "dev" })).resolves.toBe("dev");
  });

  it("reads an agent token file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vault-auth-"));
    const file = join(dir, "token");
    writeFileSync(file, "agent-token\n");

    await expect(getVaultToken("org-a", { mode: "agent", tokenFile: file })).resolves.toBe(
      "agent-token",
    );
  });

  it("logs in with the tenant's AppRole secret", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ auth: { client_token: "tenant-token", lease_duration: 600 } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const config: VaultAuthConfig = {
      mode: "approle",
      addr: "http://vault:8200",
      credentials: { "org-a": { roleId: "role-a", secretId: "secret-a" } },
      mount: "approle",
    };

    await expect(getVaultToken("org-a", config)).resolves.toBe("tenant-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://vault:8200/v1/auth/approle/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ role_id: "role-a", secret_id: "secret-a" }),
      }),
    );
  });

  it("fails when a tenant has no AppRole credentials", async () => {
    const config: VaultAuthConfig = {
      mode: "approle",
      addr: "http://vault:8200",
      credentials: {},
      mount: "approle",
    };
    await expect(getVaultToken("org-a", config)).rejects.toThrow(/no Vault AppRole credentials/);
  });
});
