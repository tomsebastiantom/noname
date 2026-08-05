import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AIPipeline } from "../../../ai-pipeline/ports";
import type { MachineEngine } from "../../../machines/ports";
import type { ArtifactCollector } from "../artifacts";
import { extractMachineDefinition } from "../artifacts";
import type { TokenAccumulator } from "../context";

export function createGenerateMachineDraftTool(
  deps: {
    aiPipeline: Pick<AIPipeline, "generateMachine">;
    machines: Pick<MachineEngine, "define">;
    artifacts: ArtifactCollector;
    tokens: TokenAccumulator;
  },
  orgId: string,
) {
  return createTool({
    id: "generateMachineDraft",
    description:
      "Generate an XState machine definition draft from a description (requires human review before use)",
    inputSchema: z.object({
      machineName: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_-]+$/),
      description: z.string().trim().min(1).max(4000),
    }),
    execute: async ({ machineName, description }) => {
      const generated = await deps.aiPipeline.generateMachine(orgId, machineName, description);
      deps.tokens.add(generated.tokens);
      const definition = extractMachineDefinition(generated.response, machineName);
      const saved = await deps.machines.define(orgId, {
        ...definition,
        name: machineName,
      });

      deps.artifacts.push({
        kind: "machine",
        documentId: saved.name,
        label: saved.name,
      });

      return {
        machineName: saved.name,
        initial: saved.initial,
        stateCount: Object.keys(saved.states).length,
      };
    },
  });
}
