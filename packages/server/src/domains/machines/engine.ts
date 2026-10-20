import { assign, createActor, createMachine } from "xstate";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/domain-error";
import { eventBus } from "../../shared/event-bus";
import { MachineEvents } from "./events";
import { normalizeMachineDefinition } from "./machine-config";
import type {
  Guard,
  MachineDefinition,
  MachineEngine,
  MachineInstanceDTO,
  MachineInstancePage,
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

type TransitionHookContext = Parameters<NonNullable<MachineEngineHooks["onTransitionComplete"]>>[0];

/**
 * Run a post-commit hook without letting its failure masquerade as a failed transition (S11).
 *
 * `storage.commitTransition` has already persisted the new state by the time this runs, so the
 * transition *happened* whether or not the hook succeeds. Letting the error propagate made a
 * committed transition report as an error — a failure inside the commerce hook (order projection,
 * audience attribution, analytics, notifications — see `bootstrap.ts`) turned a genuinely cancelled
 * order into a 500, and the client's natural retry then fails on a revision conflict instead. The
 * caller was told the opposite of what happened.
 *
 * Failures are logged with enough context to act on, and the projection can be rebuilt from the
 * persisted transition through `replayPersistedTransition` — the repair path that already exists for
 * exactly this case. So this is fail-soft by design, not by omission.
 *
 * Deliberately still awaited rather than detached. Callers depend on the projection being written
 * before the response returns (an immediate read must not observe the pre-transition state), and
 * detaching in-process work would trade this bug for silent loss on crash. Moving hooks onto a
 * durable queue is the architectural follow-up, which would also take their latency off the request.
 *
 * Returns whether the hook succeeded.
 */
async function runPostCommitHook(
  hook: NonNullable<MachineEngineHooks["onTransitionComplete"]>,
  context: TransitionHookContext,
): Promise<boolean> {
  try {
    await hook(context);
    return true;
  } catch (error) {
    console.error(
      `[machines] post-commit hook failed for "${context.event}" on instance ${context.instance.id} ` +
        `(${context.fromState} -> ${context.toState}, org ${context.orgId}); the transition is ` +
        "committed and the projection can be rebuilt via replayPersistedTransition",
      error,
    );
    return false;
  }
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

    async transition(orgId, instanceId, event, params = {}, expectedRevision) {
      const instance = await ensureInstance(orgId, instanceId);
      const currentRevision = instance.revision ?? 1;
      if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
        throw new ConflictError("Machine instance revision is stale", {
          expectedRevision,
          currentRevision,
        });
      }
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
        const expectedVersion = instance.revision ?? 1;
        const updated: MachineInstanceDTO = {
          ...instance,
          currentState: toState,
          context: nextContext,
          revision: expectedVersion + 1,
          updatedAt: new Date(),
        };
        const saved = await storage.commitTransition(
          updated,
          expectedVersion,
          event,
          result,
          params,
        );
        eventBus.publish(MachineEvents.TRANSITION, {
          orgId,
          instanceId,
          event,
          fromState,
          toState,
          params,
          // Carried so consumers can build an occurrence-unique dedupe key. Without it the only
          // available identity was `instance:event:toState`, which is identical for two separate
          // occurrences of the same transition (e.g. two addToCart calls) — so it cannot dedupe
          // without also suppressing legitimate repeats.
          revision: saved.revision,
        });

        if (hooks.onTransitionComplete) {
          // A failure here must not fail the request: the state change is already committed, so
          // reporting an error would tell the caller the opposite of what happened (S11).
          await runPostCommitHook(hooks.onTransitionComplete, {
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

    async replayPersistedTransition(
      orgId,
      instanceId,
      event,
      expectedParams,
      expectedFinalState,
      expectedFromState,
    ) {
      if (!hooks.onTransitionComplete) return false;
      const instance = await ensureInstance(orgId, instanceId);
      if (instance.currentState !== expectedFinalState) return false;

      const records = await storage.listTransitions(instanceId);
      const persisted = [...records]
        .reverse()
        .find(
          (record) =>
            record.success &&
            record.event === event &&
            record.toState === expectedFinalState &&
            (!expectedFromState || record.fromState === expectedFromState) &&
            matchesExpectedParams(record.params, expectedParams),
        );
      if (!persisted) return false;

      // Here the hook *is* the operation: this method's whole purpose is repairing a projection that
      // did not get written. So a hook failure means the repair failed, and the return value must say
      // so rather than reporting success — unlike `transition`, where the state change stands on its
      // own. The failure is still logged rather than thrown, so a caller can fall through to a normal
      // transition attempt instead of receiving an opaque 500.
      return await runPostCommitHook(hooks.onTransitionComplete, {
        orgId,
        instance,
        event: persisted.event,
        fromState: persisted.fromState,
        toState: persisted.toState,
        params: persisted.params,
      });
    },

    listInstances(orgId) {
      return storage.listInstances(orgId);
    },

    async searchInstances(orgId, query): Promise<MachineInstancePage> {
      const limit = query.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
        throw new ValidationError("limit", "must be an integer between 1 and 200");
      }
      if (query.search && query.search.trim().length > 200) {
        throw new ValidationError("search", "must be at most 200 characters");
      }
      if (query.cursor && query.cursor.length > 512) {
        throw new ValidationError("cursor", "is too long");
      }
      if (
        (query.contextExists?.length ?? 0) > 10 ||
        Object.keys(query.contextEquals ?? {}).length > 10
      ) {
        throw new ValidationError("context filters", "too many filters");
      }
      const anyOf = Object.entries(query.contextAnyOf ?? {});
      if (
        anyOf.length > 10 ||
        anyOf.some(([, values]) => values.length < 1 || values.length > 10)
      ) {
        throw new ValidationError("contextAnyOf", "filters must contain at most 10 values");
      }
      if ((query.searchContextFields?.length ?? 0) > 8) {
        throw new ValidationError("searchContextFields", "too many fields");
      }
      if ((query.contextDateAfter || query.contextDateBefore) && !query.contextDateField) {
        throw new ValidationError("contextDateField", "required with context date bounds");
      }
      const contextKeys = [
        ...(query.contextExists ?? []),
        ...Object.keys(query.contextEquals ?? {}),
        ...anyOf.map(([key]) => key),
        ...(query.searchContextFields ?? []),
        ...(query.contextDateField ? [query.contextDateField] : []),
      ];
      if (contextKeys.some((key) => !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(key))) {
        throw new ValidationError("context field", "invalid field name");
      }
      if (storage.searchInstances) {
        return storage.searchInstances(orgId, { ...query, limit });
      }
      const all = await storage.listInstances(orgId);
      const filtered = all.filter((instance) => {
        if (query.machineName && instance.machineName !== query.machineName) return false;
        if (query.states?.length && !query.states.includes(instance.currentState)) return false;
        if (query.createdAfter && instance.createdAt < query.createdAfter) return false;
        if (query.createdBefore && instance.createdAt > query.createdBefore) return false;
        const contextDateValue = query.contextDateField
          ? instance.context[query.contextDateField]
          : undefined;
        const parsedContextDate =
          typeof contextDateValue === "string" ? new Date(contextDateValue) : undefined;
        const sortDate =
          parsedContextDate && Number.isFinite(parsedContextDate.getTime())
            ? parsedContextDate
            : instance.createdAt;
        if (query.contextDateAfter && sortDate < query.contextDateAfter) return false;
        if (query.contextDateBefore && sortDate > query.contextDateBefore) return false;
        if (query.contextExists?.some((key) => !(key in instance.context))) {
          return false;
        }
        if (
          query.contextEquals &&
          !Object.entries(query.contextEquals).every(
            ([key, value]) => String(instance.context[key]) === String(value),
          )
        ) {
          return false;
        }
        if (
          query.contextAnyOf &&
          !Object.entries(query.contextAnyOf).every(([key, values]) =>
            values.some((value) => String(instance.context[key]) === String(value)),
          )
        ) {
          return false;
        }
        if (query.search) {
          const searchText = query.search.toLocaleLowerCase();
          const values = [
            instance.id,
            ...(query.searchContextFields ?? []).map((key) => instance.context[key]),
          ];
          if (
            !values.some((value) =>
              String(value ?? "")
                .toLocaleLowerCase()
                .includes(searchText),
            )
          ) {
            return false;
          }
        }
        return true;
      });
      const dateValue = (instance: MachineInstanceDTO): number => {
        const value = query.contextDateField ? instance.context[query.contextDateField] : undefined;
        const parsed = typeof value === "string" ? new Date(value) : undefined;
        return parsed && Number.isFinite(parsed.getTime())
          ? parsed.getTime()
          : instance.createdAt.getTime();
      };
      filtered.sort((a, b) => dateValue(b) - dateValue(a) || b.id.localeCompare(a.id));
      return { items: filtered.slice(0, limit), nextCursor: null };
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

function matchesExpectedParams(
  persisted: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  const entries = Object.entries(expected).filter(([, value]) => value !== undefined);
  return (
    entries.length > 0 &&
    entries.every(([key, value]) => JSON.stringify(persisted[key]) === JSON.stringify(value))
  );
}
