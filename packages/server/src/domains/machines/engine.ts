import { createMachine, createActor } from "xstate";
import type {
  MachineDefinition,
  MachineEngine,
  MachineInstanceDTO,
  MachineTransition,
  MachineStorage,
  Guard,
  GuardContext,
  TransitionResult,
} from "./ports";
import { NotFoundError, ValidationError } from "../../shared/domain-error";
import { eventBus } from "../../shared/event-bus";

// Built-in guards. External services (payments, inventory, flags) are injected
// by consumers registering guards here.
const guards = new Map<string, Guard>();

export function registerGuard(name: string, guard: Guard): void {
  guards.set(name, guard);
}

export function createMachineEngine(storage: MachineStorage): MachineEngine {
  const ensureDefinition = async (tenantId: string, name: string): Promise<MachineDefinition> => {
    const def = await storage.findDefinition(tenantId, name);
    if (!def) throw new NotFoundError("MachineDefinition", `${tenantId}/${name}`);
    return def;
  };

  const ensureInstance = async (tenantId: string, id: string): Promise<MachineInstanceDTO> => {
    const instance = await storage.findInstance(tenantId, id);
    if (!instance) throw new NotFoundError("MachineInstance", id);
    return instance;
  };

  const evaluateTransition = async (
    definition: MachineDefinition,
    instance: MachineInstanceDTO,
    transition: MachineTransition,
    params: Record<string, unknown>,
  ): Promise<TransitionResult> => {
    if (!transition.guard) {
      return { success: true, fromState: instance.currentState, toState: transition.target };
    }

    const guardFn = guards.get(transition.guard.type);
    if (!guardFn) {
      return {
        success: false,
        fromState: instance.currentState,
        toState: instance.currentState,
        error: `Unknown guard: ${transition.guard.type}`,
      };
    }

    const guardCtx: GuardContext = {
      instance,
      params: { ...transition.guard.params, ...params },
      definition,
    };

    const guardResult = await guardFn(guardCtx);
    return {
      success: guardResult.passed,
      fromState: instance.currentState,
      toState: guardResult.passed ? transition.target : instance.currentState,
      guardResult,
    };
  };

  return {
    async load(tenantId, name) {
      return ensureDefinition(tenantId, name);
    },

    async define(tenantId, definition) {
      validateDefinition(definition);
      const saved = await storage.saveDefinition(tenantId, definition);
      eventBus.publish("machine.defined", { tenantId, machineName: saved.name });
      return saved;
    },

    async start(tenantId, machineName, context) {
      const definition = await ensureDefinition(tenantId, machineName);
      if (!definition.states[definition.initial]) {
        throw new ValidationError("initial", `Unknown initial state ${definition.initial}`);
      }

      const actor = createActor(buildXStateMachine(definition), { input: context });
      actor.start();
      const initialState = actor.getSnapshot().value as string;

      const instance = await storage.createInstance(tenantId, machineName, initialState, context);
      eventBus.publish("machine.started", { tenantId, instanceId: instance.id, machineName });
      return instance;
    },

    async transition(tenantId, instanceId, event, params = {}) {
      const instance = await ensureInstance(tenantId, instanceId);
      const definition = await ensureDefinition(tenantId, instance.machineName);

      const stateConfig = definition.states[instance.currentState];
      if (!stateConfig) {
        throw new ValidationError("state", `Instance is in unknown state ${instance.currentState}`);
      }

      const transitionConfig = stateConfig.on?.[event];
      if (!transitionConfig) {
        throw new ValidationError(
          "transition",
          `Event ${event} not handled in state ${instance.currentState}`,
        );
      }

      const result = await evaluateTransition(definition, instance, transitionConfig, params);

      await storage.logTransition(instanceId, event, result, params);

      if (!result.success) {
        eventBus.publish("machine.transition.rejected", {
          tenantId,
          instanceId,
          event,
          fromState: result.fromState,
          reason: result.error || result.guardResult?.reason,
        });
        throw new ValidationError(
          "transition",
          result.error || result.guardResult?.reason || "rejected",
        );
      }

      const nextContext = await applyActions(definition, instance, transitionConfig, params);
      const updated: MachineInstanceDTO = {
        ...instance,
        currentState: result.toState,
        context: nextContext,
        updatedAt: new Date(),
      };

      await storage.updateInstance(updated);
      eventBus.publish("machine.transition", {
        tenantId,
        instanceId,
        event,
        fromState: result.fromState,
        toState: result.toState,
      });

      return updated;
    },

    async listInstances(tenantId) {
      return storage.listInstances(tenantId);
    },

    async getInstance(tenantId, id) {
      return storage.findInstance(tenantId, id);
    },
  };
}

function validateDefinition(definition: MachineDefinition): void {
  if (!definition.name || !definition.initial || !definition.states) {
    throw new ValidationError(
      "definition",
      "Machine definition must include name, initial, and states",
    );
  }
  if (!definition.states[definition.initial]) {
    throw new ValidationError("initial", `Initial state ${definition.initial} not found in states`);
  }
  for (const [stateName, state] of Object.entries(definition.states)) {
    for (const [_event, transition] of Object.entries(state.on || {})) {
      if (!definition.states[transition.target]) {
        throw new ValidationError(
          "transition",
          `Transition target ${transition.target} from state ${stateName} does not exist`,
        );
      }
    }
  }
}

function buildXStateMachine(definition: MachineDefinition) {
  const states: Record<string, any> = {};
  for (const [name, state] of Object.entries(definition.states)) {
    states[name] = {
      on: mapTransitions(state.on || {}),
    };
  }
  return createMachine({
    id: definition.name,
    initial: definition.initial,
    states,
    context: ({ input }) => input,
  });
}

function mapTransitions(on: Record<string, MachineTransition>): Record<string, { target: string }> {
  const out: Record<string, { target: string }> = {};
  for (const [event, t] of Object.entries(on)) {
    out[event] = { target: t.target };
  }
  return out;
}

async function applyActions(
  _definition: MachineDefinition,
  instance: MachineInstanceDTO,
  _transition: MachineTransition,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Phase 0: only merge params into context. Later: call action registry for
  // side effects (payment capture, inventory decrement, analytics).
  return { ...instance.context, ...params };
}
