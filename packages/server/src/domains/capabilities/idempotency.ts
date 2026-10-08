import { createHash, randomUUID } from "node:crypto";
import { and, eq, lte, or } from "drizzle-orm";
import type { Database } from "../../drizzle";
import { capabilityIdempotency } from "./schema";

const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

type StoredError = { message: string; status?: number };

export type IdempotencyClaim =
  | { kind: "claimed"; claimToken: string }
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
    claimToken: string,
    result: unknown,
  ): Promise<void>;
  fail(
    orgId: string,
    capability: string,
    idempotencyKey: string,
    claimToken: string,
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
      const claimToken = randomUUID();
      const identity = and(
        eq(capabilityIdempotency.orgId, orgId),
        eq(capabilityIdempotency.capability, capability),
        eq(capabilityIdempotency.idempotencyKey, idempotencyKey),
      );
      const inserted = await db
        .insert(capabilityIdempotency)
        .values({
          orgId,
          capability,
          idempotencyKey,
          requestHash,
          attemptId: claimToken,
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

      if (inserted.length > 0) return { kind: "claimed", claimToken };

      const [existing] = await db
        .select({
          attemptId: capabilityIdempotency.attemptId,
          requestHash: capabilityIdempotency.requestHash,
          status: capabilityIdempotency.status,
          result: capabilityIdempotency.result,
          expiresAt: capabilityIdempotency.expiresAt,
        })
        .from(capabilityIdempotency)
        .where(identity)
        .limit(1);

      if (!existing || existing.requestHash !== requestHash) return { kind: "conflict" };
      const now = new Date();
      if (existing.expiresAt <= now || existing.status === "failed") {
        const reclaimed = await db
          .update(capabilityIdempotency)
          .set({
            attemptId: claimToken,
            status: "processing",
            result: null,
            error: null,
            updatedAt: now,
            expiresAt,
          })
          .where(
            and(
              identity,
              eq(capabilityIdempotency.requestHash, requestHash),
              eq(capabilityIdempotency.attemptId, existing.attemptId),
              eq(capabilityIdempotency.status, existing.status),
              or(
                eq(capabilityIdempotency.status, "failed"),
                lte(capabilityIdempotency.expiresAt, now),
              ),
            ),
          )
          .returning({ attemptId: capabilityIdempotency.attemptId });
        if (reclaimed.length > 0) return { kind: "claimed", claimToken };

        const [latest] = await db
          .select({
            requestHash: capabilityIdempotency.requestHash,
            status: capabilityIdempotency.status,
            result: capabilityIdempotency.result,
          })
          .from(capabilityIdempotency)
          .where(identity)
          .limit(1);
        if (!latest || latest.requestHash !== requestHash) return { kind: "conflict" };
        if (latest.status === "completed") return { kind: "replay", result: latest.result };
        return { kind: "in_progress" };
      }
      if (existing.status === "completed") return { kind: "replay", result: existing.result };
      return { kind: "in_progress" };
    },

    async complete(orgId, capability, idempotencyKey, claimToken, result) {
      await db
        .update(capabilityIdempotency)
        .set({ status: "completed", result, error: null, updatedAt: new Date() })
        .where(
          and(
            eq(capabilityIdempotency.orgId, orgId),
            eq(capabilityIdempotency.capability, capability),
            eq(capabilityIdempotency.idempotencyKey, idempotencyKey),
            eq(capabilityIdempotency.attemptId, claimToken),
            eq(capabilityIdempotency.status, "processing"),
          ),
        );
    },

    async fail(orgId, capability, idempotencyKey, claimToken, failure) {
      await db
        .update(capabilityIdempotency)
        .set({ status: "failed", error: failure, updatedAt: new Date() })
        .where(
          and(
            eq(capabilityIdempotency.orgId, orgId),
            eq(capabilityIdempotency.capability, capability),
            eq(capabilityIdempotency.idempotencyKey, idempotencyKey),
            eq(capabilityIdempotency.attemptId, claimToken),
            eq(capabilityIdempotency.status, "processing"),
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
