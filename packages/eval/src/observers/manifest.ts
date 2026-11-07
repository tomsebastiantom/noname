import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckContext, MachineDefinition, ManifestObservation } from "../types";

/**
 * The manifest observer — tier 0's only I/O.
 *
 * It reads the repository's machine definition files and asks the API for the stored definition of each.
 * Checks then compare two plain values. That is the whole point of the seam: `M4`/`M5` must be runnable in a
 * unit test with two objects, and a check must never be the thing that decides how a definition is fetched.
 */

function readMachineFiles(machinesDir: string): MachineDefinition[] {
  const files = readdirSync(machinesDir).filter((file) => file.endsWith(".json"));
  return files.map((file) => {
    const parsed = JSON.parse(
      readFileSync(join(machinesDir, file), "utf8"),
    ) as Partial<MachineDefinition>;
    return {
      name: parsed.name ?? file.replace(/\.json$/, ""),
      states: parsed.states ?? {},
    };
  });
}

export async function loadManifestObservation(ctx: CheckContext): Promise<ManifestObservation> {
  let files: MachineDefinition[];

  try {
    files = readMachineFiles(ctx.machinesDir);
  } catch (cause) {
    return {
      files: [],
      stored: {},
      canReadDefinitions: ctx.canReadDefinitions,
      error: `could not read machine definition files: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }

  if (!ctx.canReadDefinitions) {
    return { files, stored: {}, canReadDefinitions: false };
  }

  const stored: Record<string, MachineDefinition | null> = {};

  for (const file of files) {
    const response = await ctx.client.getJson<{ data: MachineDefinition | null }>(
      `/api/machines/definitions/${encodeURIComponent(file.name)}`,
    );
    if (!response.ok) {
      return {
        files,
        stored,
        canReadDefinitions: true,
        error: `could not read stored definition "${file.name}": ${response.error}`,
      };
    }
    stored[file.name] = response.data?.data ?? null;
  }

  return { files, stored, canReadDefinitions: true };
}
