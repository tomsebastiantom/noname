import { and, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type {
  MachineDefinition,
  MachineInstanceDTO,
  MachineStorage,
  TransitionRecord,
} from "../ports";
import { machineDefinitions, machineInstances, machineTransitions } from "../schema";

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
      if (!row) throw new Error("Failed to save machine definition");
      return mapDefinition(row);
    },
    async listDefinitions(orgId) {
      const rows = await db
        .select()
        .from(machineDefinitions)
        .where(eq(machineDefinitions.orgId, orgId));
      return rows.map(mapDefinition);
    },

    async createInstance(orgId, machineName, initialState, context) {
      const [row] = await db
        .insert(machineInstances)
        .values({ orgId, machineName, currentState: initialState, context })
        .returning();
      if (!row) throw new Error("Failed to create machine instance");
      return mapInstance(row);
    },
    async findInstance(orgId, id) {
      const [row] = await db
        .select()
        .from(machineInstances)
        .where(and(eq(machineInstances.orgId, orgId), eq(machineInstances.id, id)));
      return row ? mapInstance(row) : null;
    },
    async updateInstance(instance) {
      const [row] = await db
        .update(machineInstances)
        .set({
          currentState: instance.currentState,
          context: instance.context,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(machineInstances.orgId, instance.orgId),
            eq(machineInstances.id, instance.id),
          ),
        )
        .returning();
      if (!row) throw new Error("Failed to update machine instance");
      return mapInstance(row);
    },
    async listInstances(orgId) {
      const rows = await db
        .select()
        .from(machineInstances)
        .where(eq(machineInstances.orgId, orgId));
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
      const rows = await db
        .select()
        .from(machineTransitions)
        .where(eq(machineTransitions.instanceId, instanceId));
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
    orgId: row.orgId,
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
