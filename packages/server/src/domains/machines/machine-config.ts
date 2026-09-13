import { ValidationError } from "../../shared/domain-error";
import type { GuardDefinition, MachineDefinition, MachineState, MachineTransition } from "./ports";

export interface NormalizedMachineState {
  on: Record<string, MachineTransition>;
  entry: string[];
  exit: string[];
  final: boolean;
}

export interface NormalizedMachineDefinition {
  id: string;
  initial: string;
  states: Record<string, NormalizedMachineState>;
}

/**
 * Validate the stored JSON contract once and return the XState-shaped subset
 * consumed by the ephemeral actor builder. The persisted DTO remains unchanged.
 */
export function normalizeMachineDefinition(
  definition: MachineDefinition,
): NormalizedMachineDefinition {
  if (!definition || typeof definition !== "object") {
    throw new ValidationError("definition", "Machine definition must be an object");
  }
  if (!definition.name || !definition.initial || !definition.states) {
    throw new ValidationError(
      "definition",
      "Machine definition must include name, initial, and states",
    );
  }
  if (!definition.states[definition.initial]) {
    throw new ValidationError("initial", `Initial state ${definition.initial} not found in states`);
  }

  const states: Record<string, NormalizedMachineState> = {};
  for (const [stateName, state] of Object.entries(definition.states)) {
    states[stateName] = normalizeState(definition, stateName, state);
  }

  return { id: definition.name, initial: definition.initial, states };
}

function normalizeState(
  definition: MachineDefinition,
  stateName: string,
  state: MachineState,
): NormalizedMachineState {
  if (!state || typeof state !== "object") {
    throw new ValidationError("state", `State ${stateName} must be an object`);
  }
  const entry = normalizeActionNames(state.entry, "entry", stateName);
  const exit = normalizeActionNames(state.exit, "exit", stateName);
  const on: Record<string, MachineTransition> = {};

  for (const [event, transition] of Object.entries(state.on ?? {})) {
    if (!transition || typeof transition !== "object" || !transition.target) {
      throw new ValidationError("transition", `Malformed transition ${stateName}.${event}`);
    }
    if (!definition.states[transition.target]) {
      throw new ValidationError(
        "transition",
        `Transition target ${transition.target} from state ${stateName} does not exist`,
      );
    }
    if (transition.guard) validateGuard(transition.guard, stateName, event);
    on[event] = {
      target: transition.target,
      ...(transition.guard ? { guard: transition.guard } : {}),
      ...(transition.actions
        ? { actions: normalizeActionNames(transition.actions, "actions", `${stateName}.${event}`) }
        : {}),
    };
  }

  return { on, entry, exit, final: state.final === true };
}

function normalizeActionNames(
  value: string[] | undefined,
  kind: string,
  location: string,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((name) => typeof name !== "string" || !name)) {
    throw new ValidationError(kind, `${kind} actions for ${location} must be an array of names`);
  }
  return [...value];
}

function validateGuard(guard: GuardDefinition, stateName: string, event: string): void {
  if (!guard || typeof guard !== "object" || !guard.type) {
    throw new ValidationError("guard", `Malformed guard ${stateName}.${event}`);
  }
  if (
    guard.params !== undefined &&
    (typeof guard.params !== "object" || guard.params === null || Array.isArray(guard.params))
  ) {
    throw new ValidationError("guard", `Guard params for ${stateName}.${event} must be an object`);
  }
}
