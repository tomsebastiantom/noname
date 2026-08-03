import { afterEach, describe, expect, it, vi } from "vitest";
import { createKetoAuthorizationAdapter } from "./adapters/keto/authorization";
import { createAuthorization, createTupleWriter } from "./create-authorization";

vi.mock("./adapters/keto/authorization", () => ({
  createKetoAuthorizationAdapter: vi.fn(() => ({
    check: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
    listDirectUserEditors: vi.fn(async () => []),
    listDirectUserPublishers: vi.fn(async () => []),
    listRelationTuples: vi.fn(async () => []),
  })),
}));

describe("createAuthorization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("always uses KetoAuthorizationAdapter for checks", () => {
    vi.stubEnv("KETO_READ_URL", "localhost:4466");
    vi.stubEnv("KETO_WRITE_URL", "localhost:4467");
    vi.stubEnv("KETO_GRPC_INSECURE", "true");
    createAuthorization();
    expect(createKetoAuthorizationAdapter).toHaveBeenCalledWith({
      readUrl: "http://localhost:4466",
      writeUrl: "http://localhost:4467",
    });
  });

  it("always uses KetoAuthorizationAdapter for tuple writes", () => {
    vi.stubEnv("KETO_READ_URL", "localhost:4466");
    vi.stubEnv("KETO_WRITE_URL", "localhost:4467");
    vi.stubEnv("KETO_GRPC_INSECURE", "true");
    createTupleWriter();
    expect(createKetoAuthorizationAdapter).toHaveBeenCalledWith({
      readUrl: "http://localhost:4466",
      writeUrl: "http://localhost:4467",
    });
  });
});
