import type { AgentExecutor } from "./tools";

export function createCompositeAgentExecutor(deps: {
  legacy: AgentExecutor;
  mastra: AgentExecutor;
}): AgentExecutor {
  const { legacy, mastra } = deps;

  return {
    async execute(orgId, type, prompt, input) {
      if (type === "orchestrate") {
        return mastra.execute(orgId, type, prompt, input);
      }
      return legacy.execute(orgId, type, prompt, input);
    },
  };
}
