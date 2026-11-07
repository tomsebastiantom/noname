import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/domain-error";
import { createMachineEngine } from "./engine";
import type {
  MachineDefinition,
  MachineInstanceDTO,
  MachineStorage,
  TransitionRecord,
  TransitionResult,
} from "./ports";

/**
 * Version pinning: an instance keeps the definition version it started on, even after a newer version is saved.
 */
function versionedStorage(initial: MachineDefinition) {
  const versions = new Map<number, MachineDefinition>([[initial.version ?? 1, initial]]);
  const instances = new Map<string, MachineInstanceDTO>();
  const transitions: TransitionRecord[] = [];
  let currentVersion = initial.version ?? 1;
  let nextId = 0;

  const storage = {
    async findDefinition(_orgId: string, name: string, version?: number) {
      if (name !== initial.name) return null;
      return versions.get(version ?? currentVersion) ?? null;
    },
    async saveDefinition(_orgId: string, definition: MachineDefinition) {
      currentVersion += 1;
      const saved = { ...definition, version: currentVersion };
      versions.set(currentVersion, saved);
      return saved;
    },
    async listDefinitions() {
      return [...versions.values()];
    },
    async createInstance(
      orgId: string,
      machineName: string,
      initialState: string,
      context: Record<string, unknown>,
      definitionVersion: number,
    ) {
      const instance: MachineInstanceDTO = {
        id: `instance-${++nextId}`,
        orgId,
        machineName,
        currentState: initialState,
        context,
        revision: 1,
        definitionVersion,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      instances.set(instance.id, instance);
      return instance;
    },
    async findInstance(_orgId: string, id: string) {
      return instances.get(id) ?? null;
    },
    async commitTransition(instance: MachineInstanceDTO, expectedRevision: number, event: string, result: TransitionResult, params: Record<string, unknown>) {
      const saved = { ...instance, revision: expectedRevision + 1 };
      instances.set(instance.id, saved);
      transitions.push({
        id: `t-${transitions.length + 1}`,
        instanceId: instance.id,
        event,
        fromState: result.fromState,
        toState: result.toState,
        params,
        guardResult: {},
        success: true,
        createdAt: new Date(),
      });
      return saved;
    },
    async listInstances() {
      return [...instances.values()];
    },
    async logTransition(instanceId: string, event: string, result: TransitionResult, params: Record<string, unknown>) {
      transitions.push({
        id: `t-${transitions.length + 1}`,
        instanceId,
        event,
        fromState: result.fromState,
        toState: result.toState,
        params,
        guardResult: {},
        success: result.success,
        error: result.error,
        createdAt: new Date(),
      });
    },
    async listTransitions() {
      return transitions;
    },
  } as unknown as MachineStorage;

  return { storage, versions };
}

const v1: MachineDefinition = {
  name: "pin-probe",
  initial: "active",
  version: 1,
  states: {
    active: { on: { advance: { target: "done" } } },
    done: { final: true },
  },
};

const v2: MachineDefinition = {
  ...v1,
  states: {
    active: {
      on: {
        advance: { target: "done" },
        v2only: { target: "done" },
      },
    },
    done: { final: true },
  },
};

describe("machine definition version pinning", () => {
  it("keeps an in-flight instance on its start version", async () => {
    const { storage } = versionedStorage(v1);
    const engine = createMachineEngine(storage);

    const oldInstance = await engine.start("org-1", "pin-probe", {});
    expect(oldInstance.definitionVersion).toBe(1);

    await engine.define("org-1", v2);

    const newInstance = await engine.start("org-1", "pin-probe", {});
    expect(newInstance.definitionVersion).toBe(2);

    // The event exists only in v2: the old instance must reject it, the new one must accept it.
    await expect(engine.transition("org-1", oldInstance.id, "v2only")).rejects.toBeInstanceOf(
      ValidationError,
    );
    const advanced = await engine.transition("org-1", newInstance.id, "v2only");
    expect(advanced.currentState).toBe("done");

    // The old instance still follows its own rules.
    const oldAdvanced = await engine.transition("org-1", oldInstance.id, "advance");
    expect(oldAdvanced.currentState).toBe("done");
  });
});
