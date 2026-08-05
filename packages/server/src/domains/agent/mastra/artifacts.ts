import type { MachineDefinition, MachineState } from "../../machines/ports";
import type { AgentArtifact } from "./types";

export interface ArtifactCollector {
  push(artifact: AgentArtifact): void;
  list(): AgentArtifact[];
}

export function createArtifactCollector(): ArtifactCollector {
  const artifacts: AgentArtifact[] = [];
  return {
    push(artifact) {
      artifacts.push(artifact);
    },
    list() {
      return [...artifacts];
    },
  };
}

export function extractLayoutSpec(response: unknown): Record<string, unknown> {
  if (response && typeof response === "object") {
    const row = response as Record<string, unknown>;
    if (row.spec && typeof row.spec === "object" && !Array.isArray(row.spec)) {
      return row.spec as Record<string, unknown>;
    }
    return row;
  }
  return { type: "container", props: {}, children: [] };
}

export function extractContentData(response: unknown): Record<string, unknown> {
  if (response && typeof response === "object" && !Array.isArray(response)) {
    return response as Record<string, unknown>;
  }
  return { title: "Generated content", body: String(response ?? "") };
}

function normalizeMachineState(raw: unknown): MachineState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const row = raw as Record<string, unknown>;
  const state: MachineState = {};

  if (row.on && typeof row.on === "object" && !Array.isArray(row.on)) {
    const on: Record<string, { target: string }> = {};
    for (const [event, transition] of Object.entries(row.on as Record<string, unknown>)) {
      if (transition && typeof transition === "object" && !Array.isArray(transition)) {
        const target = (transition as Record<string, unknown>).target;
        if (typeof target === "string") {
          on[event] = { target };
        }
      }
    }
    if (Object.keys(on).length > 0) state.on = on;
  }

  if (row.final === true || row.type === "final") {
    state.final = true;
  }

  return state;
}

export function extractMachineDefinition(
  response: unknown,
  machineName: string,
): MachineDefinition {
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const row = response as Record<string, unknown>;
    const name =
      typeof row.name === "string" && row.name.trim().length > 0 ? row.name.trim() : machineName;
    const initial = typeof row.initial === "string" ? row.initial : "idle";
    const rawStates = row.states;
    if (rawStates && typeof rawStates === "object" && !Array.isArray(rawStates)) {
      const states: Record<string, MachineState> = {};
      for (const [stateName, stateRaw] of Object.entries(rawStates as Record<string, unknown>)) {
        states[stateName] = normalizeMachineState(stateRaw);
      }
      if (Object.keys(states).length > 0) {
        return { name, initial, states };
      }
    }
  }

  return {
    name: machineName,
    initial: "idle",
    states: {
      idle: { on: { start: { target: "active" } } },
      active: { on: { complete: { target: "done" } } },
      done: { final: true },
    },
  };
}
