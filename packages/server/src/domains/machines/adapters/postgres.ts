import { and, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import { ConflictError, StorageError, ValidationError } from "../../../shared/domain-error";
import type {
  MachineDefinition,
  MachineInstanceDTO,
  MachineStorage,
  TransitionRecord,
} from "../ports";
import { machineDefinitions, machineInstances, machineTransitions } from "../schema";

const MAX_SEARCH_LIMIT = 200;
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTEXT_KEY = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;

export function createPostgresMachineStorage(db: Database): MachineStorage {
  return {
    async findDefinition(orgId, name) {
      const [row] = await db
        .select()
        .from(machineDefinitions)
        .where(and(eq(machineDefinitions.orgId, orgId), eq(machineDefinitions.name, name)));
      return row ? mapDefinition(row) : null;
    },
    async saveDefinition(orgId, definition) {
      const [row] = await db
        .insert(machineDefinitions)
        .values({
          orgId,
          name: definition.name,
          definition: definition as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: [machineDefinitions.orgId, machineDefinitions.name],
          set: {
            definition: definition as unknown as Record<string, unknown>,
            updated_at: new Date(),
          },
        })
        .returning();
      if (!row) throw new StorageError("Failed to save machine definition");
      return mapDefinition(row);
    },
    async listDefinitions(orgId) {
      const rows = await db
        .select()
        .from(machineDefinitions)
        .where(eq(machineDefinitions.orgId, orgId))
        .limit(200);
      return rows.map(mapDefinition);
    },

    async createInstance(orgId, machineName, initialState, context) {
      const [row] = await db
        .insert(machineInstances)
        .values({ orgId, machineName, currentState: initialState, context, revision: 1 })
        .returning();
      if (!row) throw new StorageError("Failed to create machine instance");
      return mapInstance(row);
    },
    async findInstance(orgId, id) {
      const [row] = await db
        .select()
        .from(machineInstances)
        .where(and(eq(machineInstances.orgId, orgId), eq(machineInstances.id, id)));
      return row ? mapInstance(row) : null;
    },
    async commitTransition(instance, expectedRevision, event, result, params) {
      if (!result.success) throw new StorageError("Only successful transitions may be committed");
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(machineInstances)
          .set({
            currentState: instance.currentState,
            context: instance.context,
            revision: expectedRevision + 1,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(machineInstances.orgId, instance.orgId),
              eq(machineInstances.id, instance.id),
              eq(machineInstances.revision, expectedRevision),
            ),
          )
          .returning();
        if (!row) {
          throw new ConflictError("Machine instance revision is stale", {
            expectedRevision,
          });
        }
        await tx.insert(machineTransitions).values({
          instanceId: instance.id,
          event,
          fromState: result.fromState,
          toState: result.toState,
          params,
          guardResult: (result.guardResult as unknown as Record<string, unknown>) || {},
          success: "true",
          error: null,
        });
        return mapInstance(row);
      });
    },
    async listInstances(orgId) {
      const rows = await db
        .select()
        .from(machineInstances)
        .where(eq(machineInstances.orgId, orgId))
        .limit(200);
      return rows.map(mapInstance);
    },
    async searchInstances(orgId, query) {
      const limit = boundedLimit(query.limit);
      const conditions: SQL[] = [eq(machineInstances.orgId, orgId)];
      if (query.machineName) conditions.push(eq(machineInstances.machineName, query.machineName));
      if (query.states?.length)
        conditions.push(inArray(machineInstances.currentState, query.states));
      if (query.createdAfter)
        conditions.push(sql`${machineInstances.created_at} >= ${query.createdAfter}`);
      if (query.createdBefore)
        conditions.push(sql`${machineInstances.created_at} <= ${query.createdBefore}`);
      if ((query.contextDateAfter || query.contextDateBefore) && !query.contextDateField) {
        throw new ValidationError("contextDateField", "required with context date bounds");
      }
      if (query.contextDateField) validateContextKey(query.contextDateField);
      const contextDateExpression = query.contextDateField
        ? sql`CASE
            WHEN ${machineInstances.context}->>${query.contextDateField} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
            THEN (${machineInstances.context}->>${query.contextDateField})::timestamptz
            ELSE ${machineInstances.created_at} AT TIME ZONE 'UTC'
          END`
        : sql`${machineInstances.created_at} AT TIME ZONE 'UTC'`;
      if (query.contextDateAfter)
        conditions.push(sql`${contextDateExpression} >= ${query.contextDateAfter}`);
      if (query.contextDateBefore)
        conditions.push(sql`${contextDateExpression} <= ${query.contextDateBefore}`);

      const contextExists = query.contextExists ?? [];
      if (contextExists.length > 10) throw new ValidationError("contextExists", "too many filters");
      for (const key of contextExists) {
        validateContextKey(key);
        conditions.push(sql`${machineInstances.context} ? ${key}`);
      }

      const contextEquals = query.contextEquals ?? {};
      const equalityEntries = Object.entries(contextEquals);
      if (equalityEntries.length > 10)
        throw new ValidationError("contextEquals", "too many filters");
      for (const [key, value] of equalityEntries) {
        validateContextKey(key);
        conditions.push(sql`${machineInstances.context}->>${key} = ${String(value)}`);
      }

      const anyOfEntries = Object.entries(query.contextAnyOf ?? {});
      if (anyOfEntries.length > 10) throw new ValidationError("contextAnyOf", "too many filters");
      for (const [key, values] of anyOfEntries) {
        validateContextKey(key);
        if (values.length < 1 || values.length > 10) {
          throw new ValidationError("contextAnyOf", "each filter must contain 1 to 10 values");
        }
        conditions.push(
          or(
            ...values.map((value) => sql`${machineInstances.context}->>${key} = ${String(value)}`),
          )!,
        );
      }

      const search = query.search?.trim();
      if (search) {
        if (search.length > 200)
          throw new ValidationError("search", "must be at most 200 characters");
        const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
        const fields = (query.searchContextFields ?? []).slice(0, 8);
        for (const field of fields) validateContextKey(field);
        const searchConditions: SQL[] = [sql`${machineInstances.id}::text ILIKE ${pattern}`];
        for (const field of fields) {
          searchConditions.push(sql`${machineInstances.context}->>${field} ILIKE ${pattern}`);
        }
        conditions.push(or(...searchConditions)!);
      }

      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        const cursorDateExpression = query.contextDateField
          ? sql`CASE
              WHEN cursor.context->>${query.contextDateField} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
              THEN (cursor.context->>${query.contextDateField})::timestamptz
              ELSE cursor.created_at AT TIME ZONE 'UTC'
            END`
          : sql`cursor.created_at AT TIME ZONE 'UTC'`;
        conditions.push(sql`(${contextDateExpression}, ${machineInstances.id}) < (
          SELECT ${cursorDateExpression}, cursor.id
          FROM machine_instances AS cursor
          WHERE cursor.org_id = ${orgId} AND cursor.id = ${cursor.id}::uuid
        )`);
      }

      const rows = await db
        .select()
        .from(machineInstances)
        .where(and(...conditions))
        .orderBy(desc(contextDateExpression), desc(machineInstances.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const last = pageRows[pageRows.length - 1];
      return {
        items: pageRows.map(mapInstance),
        nextCursor: hasMore && last ? encodeCursor(last.id) : null,
      };
    },

    async logTransition(instanceId, event, result, params) {
      await db.insert(machineTransitions).values({
        instanceId,
        event,
        fromState: result.fromState,
        toState: result.toState,
        params,
        guardResult: (result.guardResult as unknown as Record<string, unknown>) || {},
        success: String(result.success),
        error: result.error,
      });
    },
    async listTransitions(instanceId) {
      const rows = await db
        .select()
        .from(machineTransitions)
        .where(eq(machineTransitions.instanceId, instanceId))
        .limit(200);
      return rows.map(mapTransition);
    },
  };
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return 50;
  if (!Number.isInteger(value) || value < 1 || value > MAX_SEARCH_LIMIT) {
    throw new ValidationError("limit", `must be an integer between 1 and ${MAX_SEARCH_LIMIT}`);
  }
  return value;
}

function validateContextKey(key: string): void {
  if (!CONTEXT_KEY.test(key)) throw new ValidationError("context field", "invalid field name");
}

function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id })).toString("base64url");
}

function decodeCursor(value: string): { id: string } {
  if (value.length > 512) throw new ValidationError("cursor", "is too long");
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
    };
    if (typeof decoded.id !== "string" || !CURSOR_ID.test(decoded.id)) {
      throw new Error("invalid cursor");
    }
    return { id: decoded.id };
  } catch {
    throw new ValidationError("cursor", "is invalid");
  }
}

function mapDefinition(row: typeof machineDefinitions.$inferSelect): MachineDefinition {
  const def = row.definition as MachineDefinition;
  return { name: row.name, initial: def.initial, states: def.states };
}

function mapInstance(row: typeof machineInstances.$inferSelect): MachineInstanceDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    machineName: row.machineName,
    currentState: row.currentState,
    context: (row.context || {}) as Record<string, unknown>,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransition(row: typeof machineTransitions.$inferSelect): TransitionRecord {
  return {
    id: row.id,
    instanceId: row.instanceId,
    event: row.event,
    fromState: row.fromState,
    toState: row.toState,
    params: (row.params || {}) as Record<string, unknown>,
    guardResult: (row.guardResult || {}) as Record<string, unknown>,
    success: row.success === "true",
    error: row.error ?? undefined,
    createdAt: row.created_at,
  };
}
