import { and, eq } from "drizzle-orm";
import { machineDefinitions, machineInstances, machineTransitions } from "../schema";
import { machineSchemasUpdated } from "../schema";
import type {
  MachineDefinition,
  MachineInstanceDTO,
  MachineStorage,
  TransitionRecord,
  TransitionResult,
} from "../ports";
import type { Database } from "../../../drizzle";

export function createPostgresMachineStorage(db: Database): MachineStorage {
  return {
    async findDefinition(tenantId, name) {
      const [row] = await db.select().from(machineDefinitions).where(
        and(eq(machineDefinitions.tenantId, tenantId), eq(machineDefinitions.name, name)),
      );
      return row ? mapDefinition(row) : null;
    },
    async saveDefinition(tenantId, definition) {
      const [row] = await db.insert(machineDefinitions)
        .values({ tenantId, name: definition.name, definition: definition as unknown as Record<string, unknown> })
        .onConflictDoUpdate({
          target: [machineDefinitions.tenantId, machineDefinitions.name],
          set: { definition: definition as unknown as Record<string, unknown>, updated_at: new Date() },
        })
        .returning();
      if (!row) throw new Error("Failed to save machine definition");
      return mapDefinition(row);
    },
    async listDefinitions(tenantId) {
      const rows = await db.select().from(machineDefinitions).where(eq(machineDefinitions.tenantId, tenantId));
      return rows.map(mapDefinition);
    },

    async createInstance(tenantId, machineName, initialState, context) {
      const [row] = await db.insert(machineInstances)
        .values({ tenantId, machineName, currentState: initialState, context })
        .returning();
      if (!row) throw new Error("Failed to create machine instance");
      return mapInstance(row);
    },
    async findInstance(tenantId, id) {
      const [row] = await db.select().from(machineInstances).where(
        and(eq(machineInstances.tenantId, tenantId), eq(machineInstances.id, id)),
      );
      return row ? mapInstance(row) : null;
    },
    async updateInstance(instance) {
      const [row] = await db.update(machineInstances)
        .set({ currentState: instance.currentState, context: instance.context, updated_at: new Date() })
        .where(and(eq(machineInstances.tenantId, instance.tenantId), eq(machineInstances.id, instance.id)))
        .returning();
      if (!row) throw new Error("Failed to update machine instance");
      return mapInstance(row);
    },
    async listInstances(tenantId) {
      const rows = await db.select().from(machineInstances).where(eq(machineInstances.tenantId, tenantId));
      return rows.map(mapInstance);
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
      const rows = await db.select().from(machineTransitions).where(eq(machineTransitions.instanceId, instanceId));
      return rows.map(mapTransition);
    },
  };
}

function mapDefinition(row: typeof machineDefinitions.$inferSelect): MachineDefinition {
  const def = row.definition as MachineDefinition;
  return { name: row.name, initial: def.initial, states: def.states };
}

function mapInstance(row: typeof machineInstances.$inferSelect): MachineInstanceDTO {
  return {
    id: row.id,
    tenantId: row.tenantId,
    machineName: row.machineName,
    currentState: row.currentState,
    context: (row.context || {}) as Record<string, unknown>,
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
