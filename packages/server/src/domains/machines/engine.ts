import { createActor, createMachine } from "xstate";
import { NotFoundError, ValidationError } from "../../shared/domain-error";
import { eventBus } from "../../shared/event-bus";
import { MachineEvents } from "./events";
import type {
  Guard,
  GuardContext,
  MachineDefinition,
  MachineEngine,
  MachineInstanceDTO,
  MachineStorage,
  MachineTransition,
  TransitionResult,
} from "./ports";

// Built-in guards. External services (payments, inventory, flags) are injected
// by consumers registering guards here.
const guards = new Map<string, Guard>();

export function registerGuard(name: string, guard: Guard): void {
  guards.set(name, guard);
}

export interface MachineEngineHooks {
  onTransitionComplete?: (ctx: {
    orgId: string;
    instance: MachineInstanceDTO;
    event: string;
    fromState: string;
    toState: string;
    params: Record<string, unknown>;
  }) => Promise<void>;
}

export function createMachineEngine(
  storage: MachineStorage,
  hooks: MachineEngineHooks = {},
): MachineEngine {
  const ensureDefinition = async (orgId: string, name: string): Promise<MachineDefinition> => {
    const def = await storage.findDefinition(orgId, name);
    if (!def) throw new NotFoundError("MachineDefinition", `${orgId}/${name}`);
    return def;
  };

  const ensureInstance = async (orgId: string, id: string): Promise<MachineInstanceDTO> => {
    const instance = await storage.findInstance(orgId, id);
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
    async load(orgId, name) {
      return ensureDefinition(orgId, name);
    },

    async define(orgId, definition) {
      validateDefinition(definition);
      const saved = await storage.saveDefinition(orgId, definition);
      eventBus.publish(MachineEvents.DEFINED, { orgId, machineName: saved.name });
      return saved;
    },

    listDefinitions(orgId) {
      return storage.listDefinitions(orgId);
    },

    async start(orgId, machineName, context) {
      const definition = await ensureDefinition(orgId, machineName);
      if (!definition.states[definition.initial]) {
        throw new ValidationError("initial", `Unknown initial state ${definition.initial}`);
      }

      const actor = createActor(buildXStateMachine(definition), { input: context });
      actor.start();
      const initialState = actor.getSnapshot().value as string;

      const instance = await storage.createInstance(orgId, machineName, initialState, context);
      eventBus.publish(MachineEvents.STARTED, { orgId, instanceId: instance.id, machineName });
      return instance;
    },

    async transition(orgId, instanceId, event, params = {}) {
      const instance = await ensureInstance(orgId, instanceId);
      const definition = await ensureDefinition(orgId, instance.machineName);

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
        eventBus.publish(MachineEvents.TRANSITION_REJECTED, {
          orgId,
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
      eventBus.publish(MachineEvents.TRANSITION, {
        orgId,
        instanceId,
        event,
        fromState: result.fromState,
        toState: result.toState,
      });

      if (hooks.onTransitionComplete) {
        await hooks.onTransitionComplete({
          orgId,
          instance: updated,
          event,
          fromState: result.fromState,
          toState: result.toState,
          params,
        });
      }

      return updated;
    },

    async listInstances(orgId) {
      return storage.listInstances(orgId);
    },

    async getInstance(orgId, id) {
      return storage.findInstance(orgId, id);
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
