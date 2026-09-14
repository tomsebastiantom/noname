import { assign, createActor, createMachine } from "xstate";
import { NotFoundError, ValidationError } from "../../shared/domain-error";
import { eventBus } from "../../shared/event-bus";
import { MachineEvents } from "./events";
import { normalizeMachineDefinition } from "./machine-config";
import type {
  Guard,
  MachineDefinition,
  MachineEngine,
  MachineInstanceDTO,
  MachineStorage,
  TransitionResult,
} from "./ports";

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

type MachineEvent = { type: string; params?: Record<string, unknown> };

type Execution = {
  actor: ReturnType<typeof createActor>;
  state: string;
  context: Record<string, unknown>;
};

export function createMachineEngine(
  storage: MachineStorage,
  hooks: MachineEngineHooks = {},
): MachineEngine {
  const ensureDefinition = async (orgId: string, name: string): Promise<MachineDefinition> => {
    const definition = await storage.findDefinition(orgId, name);
    if (!definition) throw new NotFoundError("MachineDefinition", `${orgId}/${name}`);
    normalizeMachineDefinition(definition);
    return definition;
  };

  const ensureInstance = async (orgId: string, id: string): Promise<MachineInstanceDTO> => {
    const instance = await storage.findInstance(orgId, id);
    if (!instance) throw new NotFoundError("MachineInstance", id);
    return instance;
  };

  return {
    async load(orgId, name) {
      return ensureDefinition(orgId, name);
    },

    async define(orgId, definition) {
      normalizeMachineDefinition(definition);
      const saved = await storage.saveDefinition(orgId, definition);
      eventBus.publish(MachineEvents.DEFINED, { orgId, machineName: saved.name });
      return saved;
    },

    listDefinitions(orgId) {
      return storage.listDefinitions(orgId);
    },

    async start(orgId, machineName, context) {
      const definition = await ensureDefinition(orgId, machineName);
      const execution = startActor(definition, context);
      try {
        const instance = await storage.createInstance(
          orgId,
          machineName,
          execution.state,
          execution.context,
        );
        eventBus.publish(MachineEvents.STARTED, { orgId, instanceId: instance.id, machineName });
        return instance;
      } finally {
        execution.actor.stop();
      }
    },

    async transition(orgId, instanceId, event, params = {}) {
      const instance = await ensureInstance(orgId, instanceId);
      const definition = await ensureDefinition(orgId, instance.machineName);
      const execution = startActor(definition, instance.context, instance.currentState);
      const fromState = execution.state;

      try {
        execution.actor.send({ type: event, params });
        const snapshot = execution.actor.getSnapshot();
        const toState = stateValue(snapshot.value);
        const nextContext = snapshot.context as Record<string, unknown>;
        const changed = toState !== fromState || !sameContext(nextContext, instance.context);

        if (!changed) {
          const result: TransitionResult = {
            success: false,
            fromState,
            toState: fromState,
            error: `Event ${event} was rejected in state ${fromState}`,
          };
          await storage.logTransition(instanceId, event, result, params);
          eventBus.publish(MachineEvents.TRANSITION_REJECTED, {
            orgId,
            instanceId,
            event,
            fromState,
            reason: result.error,
          });
          throw new ValidationError("transition", result.error ?? "rejected");
        }

        const result: TransitionResult = { success: true, fromState, toState };
        await storage.logTransition(instanceId, event, result, params);
        const updated: MachineInstanceDTO = {
          ...instance,
          currentState: toState,
          context: nextContext,
          updatedAt: new Date(),
        };
        const saved = await storage.updateInstance(updated);
        eventBus.publish(MachineEvents.TRANSITION, {
          orgId,
          instanceId,
          event,
          fromState,
          toState,
          params,
        });

        if (hooks.onTransitionComplete) {
          await hooks.onTransitionComplete({
            orgId,
            instance: saved,
            event,
            fromState,
            toState,
            params,
          });
        }
        return saved;
      } finally {
        execution.actor.stop();
      }
    },

    listInstances(orgId) {
      return storage.listInstances(orgId);
    },

    getInstance(orgId, id) {
      return storage.findInstance(orgId, id);
    },
  };
}

function startActor(
  definition: MachineDefinition,
  context: Record<string, unknown>,
  currentState?: string,
): Execution {
  const normalized = normalizeMachineDefinition(definition);
  const machine = createMachine({
    id: normalized.id,
    initial: normalized.initial,
    context: ({ input }) => input as Record<string, unknown>,
    states: Object.fromEntries(
      Object.entries(normalized.states).map(([name, state]) => [
        name,
        {
          type: state.final ? "final" : undefined,
          on: Object.fromEntries(
            Object.entries(state.on).map(([event, transition]) => [
              event,
              {
                target: transition.target,
                guard: transition.guard
                  ? ({
                      context,
                      event: received,
                    }: {
                      context: Record<string, unknown>;
                      event: MachineEvent;
                    }) => {
                      const guard = guards.get(transition.guard!.type);
                      if (!guard) return false;
                      const result = guard({
                        instance: {
                          id: "ephemeral",
                          orgId: "ephemeral",
                          machineName: normalized.id,
                          currentState: name,
                          context,
                          createdAt: new Date(0),
                          updatedAt: new Date(0),
                        },
                        params: { ...transition.guard!.params, ...(received.params ?? {}) },
                        definition,
                      });
                      if (result instanceof Promise) {
                        throw new ValidationError(
                          "guard",
                          "Asynchronous guards are not supported by XState transitions",
                        );
                      }
                      return result.passed;
                    }
                  : undefined,
                // Existing machine definitions use event params as context updates. Keep that
                // public behavior, but express it as an XState action rather than an engine merge.
                actions: assign(
                  ({
                    context,
                    event: received,
                  }: {
                    context: Record<string, unknown>;
                    event: MachineEvent;
                  }) => ({
                    ...context,
                    ...(received.params ?? {}),
                  }),
                ),
              },
            ]),
          ),
        },
      ]),
    ),
  });
  const actor = createActor(machine, {
    input: context,
    snapshot: currentState ? machine.resolveState({ value: currentState, context }) : undefined,
  });
  actor.start();
  const snapshot = actor.getSnapshot();
  return {
    actor,
    state: stateValue(snapshot.value),
    context: snapshot.context as Record<string, unknown>,
  };
}

function stateValue(value: unknown): string {
  if (typeof value === "string") return value;
  throw new ValidationError("state", "Only flat XState states are supported");
}

function sameContext(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
