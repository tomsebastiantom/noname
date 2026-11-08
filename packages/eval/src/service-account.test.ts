import { afterEach, describe, expect, it, vi } from "vitest";
import { readTenantEvalKey, VaultSecretNotFoundError, type VaultConfig } from "./service-account";

const config: VaultConfig = {
  addr: "http://vault:8200",
  mount: "secret",
  pathPrefix: "noname",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readTenantEvalKey", () => {
  it("returns the key stored for the tenant", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            data: {
              key: JSON.stringify({ keyId: "k1", userId: "u1", key: "private" }),
            },
          },
        }),
      })),
    );

    await expect(
      readTenantEvalKey("org-a", config, { mode: "token", token: "dev" }),
    ).resolves.toEqual({ keyId: "k1", userId: "u1", key: "private" });
  });

  it("distinguishes a missing secret from an auth failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    await expect(
      readTenantEvalKey("org-a", config, { mode: "token", token: "dev" }),
    ).rejects.toBeInstanceOf(VaultSecretNotFoundError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })),
    );
    await expect(
      readTenantEvalKey("org-a", config, { mode: "token", token: "dev" }),
    ).rejects.not.toBeInstanceOf(VaultSecretNotFoundError);
  });
});
