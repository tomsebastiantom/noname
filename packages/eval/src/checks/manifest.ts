import type { Check, CheckResult } from "../types";

/**
 * Tier 0 — manifest checks. No browser, no queue: these answer "does what the database holds agree
 * with what the repository declares?".
 *
 * If that reads like a one-line description, it is because the I/O now lives in the manifest observer:
 * these functions receive `ctx.manifest` and compare two plain values. They are pure, so a unit test
 * needs no temporary directory, no API and no network — and the check can never grow a second data path.
 *
 * They exist because of two real defects:
 *  - the stored cart definition held 4 states while `cart.json` declared 9, which made
 *    cancel/fulfill/refund unreachable through the real path and nothing reported it;
 *  - `inventory_reservation` existed in the database only because it had been inserted by hand, so a
 *    fresh environment had no inventory machine at all.
 */

function skip(id: string, detail: string): CheckResult {
  return { id, status: "skip", level: "error", detail };
}

/** Shared precondition: without an observation, or without a credential, the check cannot speak. */
function unavailable(id: string, ctx: Parameters<Check["run"]>[0]): CheckResult | null {
  const obs = ctx.manifest;
  if (!obs) {
    return skip(id, "manifest observation was not built — the runner could not read definitions");
  }
  if (!obs.canReadDefinitions) {
    return skip(
      id,
      `reading definitions needs MACHINES_DEFINE; pass --token (${obs.files.length} file(s) on disk were not compared)`,
    );
  }
  if (obs.error) {
    return skip(id, obs.error);
  }
  return null;
}

/** M5.vocabulary — every definition file is registered, i.e. the runtime can actually load it. */
const vocabulary: Check["run"] = async (ctx) => {
  const blocked = unavailable("M5.vocabulary", ctx);
  if (blocked) return [blocked];

  const obs = ctx.manifest!;
  const results: CheckResult[] = [];

  for (const file of obs.files) {
    const stored = obs.stored[file.name];

    if (!stored) {
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
const machines: Check["run"] = async (ctx) => {
  const blocked = unavailable("M4.machines", ctx);
  if (blocked) return [blocked];

  const obs = ctx.manifest!;
  const results: CheckResult[] = [];

  for (const file of obs.files) {
    const stored = obs.stored[file.name];
    if (!stored) {
      // M5 already reports absence; do not double-report it here.
      continue;
    }

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

export const manifestChecks: Check[] = [
  {
    meta: {
      id: "M5.vocabulary",
      tier: 0,
      defaultLevel: "error",
      needs: ["api", "manifest"],
      emits: ["M5.vocabulary"],
      description:
        "every machine definition file is registered, so a fresh environment can load it",
    },
    run: vocabulary,
  },
  {
    meta: {
      id: "M4.machines",
      tier: 0,
      defaultLevel: "error",
      needs: ["api", "manifest"],
      emits: ["M4.machines"],
      description:
        "the stored machine definition agrees with the file, state for state and transition for transition",
    },
    run: machines,
  },
];
