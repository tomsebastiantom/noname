import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../drizzle";
import { capabilityIdempotency } from "./schema";

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

type StoredError = { message: string; status?: number };

export type IdempotencyClaim =
  | { kind: "claimed" }
  | { kind: "replay"; result: unknown }
  | { kind: "in_progress" }
  | { kind: "conflict" };

export interface CapabilityIdempotencyStore {
  claim(
    orgId: string,
    capability: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<IdempotencyClaim>;
  complete(
    orgId: string,
    capability: string,
    idempotencyKey: string,
    result: unknown,
  ): Promise<void>;
  fail(
    orgId: string,
    capability: string,
    idempotencyKey: string,
    error: StoredError,
  ): Promise<void>;
}

export function hashCapabilityRequest(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export function createCapabilityIdempotencyStore(
  db: Database,
  retentionMs = DEFAULT_RETENTION_MS,
): CapabilityIdempotencyStore {
  return {
    async claim(orgId, capability, idempotencyKey, requestHash) {
      const expiresAt = new Date(Date.now() + retentionMs);
      const inserted = await db
        .insert(capabilityIdempotency)
        .values({
          orgId,
          capability,
          idempotencyKey,
          requestHash,
          status: "processing",
          expiresAt,
        })
        .onConflictDoNothing({
          target: [
            capabilityIdempotency.orgId,
            capabilityIdempotency.capability,
            capabilityIdempotency.idempotencyKey,
          ],
        })
        .returning({ id: capabilityIdempotency.id });

      if (inserted.length > 0) return { kind: "claimed" };

      const [existing] = await db
        .select({
          requestHash: capabilityIdempotency.requestHash,
          status: capabilityIdempotency.status,
          result: capabilityIdempotency.result,
          expiresAt: capabilityIdempotency.expiresAt,
        })
        .from(capabilityIdempotency)
        .where(
          and(
            eq(capabilityIdempotency.orgId, orgId),
            eq(capabilityIdempotency.capability, capability),
            eq(capabilityIdempotency.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);

      if (!existing || existing.requestHash !== requestHash) return { kind: "conflict" };
      if (existing.expiresAt <= new Date() || existing.status === "failed") {
        await db
          .update(capabilityIdempotency)
          .set({
            status: "processing",
            result: null,
            error: null,
            updatedAt: new Date(),
            expiresAt,
          })
          .where(
            and(
              eq(capabilityIdempotency.orgId, orgId),
              eq(capabilityIdempotency.capability, capability),
              eq(capabilityIdempotency.idempotencyKey, idempotencyKey),
            ),
          );
        return { kind: "claimed" };
      }
      if (existing.status === "completed") return { kind: "replay", result: existing.result };
      return { kind: "in_progress" };
    },

    async complete(orgId, capability, idempotencyKey, result) {
      await db
        .update(capabilityIdempotency)
        .set({ status: "completed", result, error: null, updatedAt: new Date() })
        .where(
          and(
            eq(capabilityIdempotency.orgId, orgId),
            eq(capabilityIdempotency.capability, capability),
            eq(capabilityIdempotency.idempotencyKey, idempotencyKey),
          ),
        );
    },

    async fail(orgId, capability, idempotencyKey, failure) {
      await db
        .update(capabilityIdempotency)
        .set({ status: "failed", error: failure, updatedAt: new Date() })
        .where(
          and(
            eq(capabilityIdempotency.orgId, orgId),
            eq(capabilityIdempotency.capability, capability),
            eq(capabilityIdempotency.idempotencyKey, idempotencyKey),
          ),
        );
    },
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(",")}}`;
}

export type { StoredError };
