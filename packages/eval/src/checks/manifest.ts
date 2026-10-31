import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Check, CheckContext, CheckResult } from "../types";

/**
 * Tier 0 — manifest checks. No browser, no queue: these answer "does what the database holds agree
 * with what the repository declares?".
 *
 * They exist because of two real defects:
 *  - the stored cart definition held 4 states while `cart.json` declared 9, which made
 *    cancel/fulfill/refund unreachable through the real path and nothing reported it;
 *  - `inventory_reservation` existed in the database only because it had been inserted by hand, so a
 *    fresh environment had no inventory machine at all.
 */

type MachineFile = {
  name: string;
  states?: Record<string, { on?: Record<string, { target?: string }> }>;
};

type StoredDefinition = {
  name: string;
  states?: Record<string, { on?: Record<string, { target?: string }> }>;
};

function readMachineFiles(machinesDir: string): MachineFile[] {
  const files = readdirSync(machinesDir).filter((file) => file.endsWith(".json"));
  return files.map((file) => {
    const parsed = JSON.parse(readFileSync(join(machinesDir, file), "utf8")) as MachineFile;
    return { ...parsed, name: parsed.name ?? file.replace(/\.json$/, "") };
  });
}

/** M5.vocabulary — every definition file is registered, i.e. the runtime can actually load it. */
const vocabulary: Check = async (ctx) => {
  const files = readMachineFiles(ctx.machinesDir);
  if (!ctx.canReadDefinitions) {
    return [
      {
        id: "M5.vocabulary",
        status: "skip",
        level: "error",
        detail: `reading definitions needs MACHINES_DEFINE; pass --token (${files.length} file(s) on disk were not compared)`,
      },
    ];
  }
  const results: CheckResult[] = [];

  for (const file of files) {
    const response = await ctx.client.getJson<{ data: StoredDefinition | null }>(
      `/api/machines/definitions/${encodeURIComponent(file.name)}`,
    );

    if (!response.ok) {
      results.push({
        id: "M5.vocabulary",
        status: "fail",
        level: "error",
        subject: file.name,
        detail: `definition "${file.name}" exists in the repository but the API could not return it (${response.error}) — is it seeded?`,
      });
      continue;
    }

    if (!response.data?.data) {
      results.push({
        id: "M5.vocabulary",
        status: "fail",
        level: "error",
        subject: file.name,
        detail: `definition "${file.name}" is not registered — a fresh environment would have no ${file.name} machine, so any capability that drives it fails there while passing locally`,
      });
      continue;
    }

    results.push({
      id: "M5.vocabulary",
      status: "pass",
      level: "error",
      subject: file.name,
      detail: `definition "${file.name}" is registered`,
    });
  }

  return results;
};

/** M4.machines — the stored definition agrees with the file, state for state and transition for transition. */
const machines: Check = async (ctx) => {
  const files = readMachineFiles(ctx.machinesDir);
  if (!ctx.canReadDefinitions) {
    return [
      {
        id: "M4.machines",
        status: "skip",
        level: "error",
        detail: "reading definitions needs MACHINES_DEFINE; pass --token",
      },
    ];
  }
  const results: CheckResult[] = [];

  for (const file of files) {
    const response = await ctx.client.getJson<{ data: StoredDefinition | null }>(
      `/api/machines/definitions/${encodeURIComponent(file.name)}`,
    );
    if (!response.ok || !response.data?.data) {
      // M5 already reports absence; do not double-report it here.
      continue;
    }

    const stored = response.data.data;
    const fileStates = Object.keys(file.states ?? {}).sort();
    const storedStates = Object.keys(stored.states ?? {}).sort();

    if (fileStates.join(",") !== storedStates.join(",")) {
      results.push({
        id: "M4.machines",
        status: "fail",
        level: "error",
        subject: file.name,
        detail: `state drift: the file declares [${fileStates.join(", ")}] but the stored row has [${storedStates.join(", ")}]`,
      });
      continue;
    }

    const wrong: string[] = [];
    for (const [state, node] of Object.entries(file.states ?? {})) {
      for (const [event, transition] of Object.entries(node.on ?? {})) {
        const storedTarget = stored.states?.[state]?.on?.[event]?.target;
        if (transition.target !== storedTarget) {
          wrong.push(
            `${state} --${event}--> ${transition.target ?? "?"} (stored: ${storedTarget ?? "absent"})`,
          );
        }
      }
    }

    results.push(
      wrong.length === 0
        ? {
            id: "M4.machines",
            status: "pass",
            level: "error",
            subject: file.name,
            detail: `stored definition agrees with the file (${fileStates.length} states)`,
          }
        : {
            id: "M4.machines",
            status: "fail",
            level: "error",
            subject: file.name,
            detail: `transition drift: ${wrong.slice(0, 3).join("; ")}${wrong.length > 3 ? ` (+${wrong.length - 3} more)` : ""}`,
          },
    );
  }

  return results;
};

export const manifestChecks: { id: string; run: Check }[] = [
  { id: "M5.vocabulary", run: vocabulary },
  { id: "M4.machines", run: machines },
];

export type { CheckContext };
