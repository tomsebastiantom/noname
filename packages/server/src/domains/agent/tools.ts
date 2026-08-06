export interface AgentToolResult {
  output: Record<string, unknown>;
  model: string;
  tokens: number;
}

export interface AgentExecuteOptions {
  onProgress?: (output: Record<string, unknown>) => Promise<void>;
}

export interface AgentExecutor {
  execute(
    orgId: string,
    type: string,
    prompt: string,
    input: Record<string, unknown>,
    options?: AgentExecuteOptions,
  ): Promise<AgentToolResult>;
}

export interface AgentTool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  execute(params: Record<string, unknown>): Promise<unknown>;
}

export function defineTools(getExecutor: () => AgentExecutor): Record<string, AgentTool> {
  const exec = () => getExecutor();
  return {
    generateLayout: {
      name: "generateLayout",
      description: "Generate a json-render layout JSON spec from a prompt",
      schema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Description of the layout to generate" },
        },
        required: ["prompt"],
      },
      async execute(params) {
        return exec().execute("", "generate_layout", params.prompt as string, params);
      },
    },
    generateContent: {
      name: "generateContent",
      description: "Generate content entries from a prompt",
      schema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Description of the content to generate" },
        },
        required: ["prompt"],
      },
      async execute(params) {
        return exec().execute("", "generate_content", params.prompt as string, params);
      },
    },
    generateMachine: {
      name: "generateMachine",
      description: "Generate an XState machine definition from a description",
      schema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Description of the machine workflow to generate",
          },
        },
        required: ["prompt"],
      },
      async execute(params) {
        return exec().execute("", "generate_machine", params.prompt as string, params);
      },
    },
    analyzeAnalytics: {
      name: "analyzeAnalytics",
      description: "Analyze analytics data and return insights",
      schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to analyze" },
        },
        required: ["query"],
      },
      async execute(params) {
        return exec().execute("", "analyze_analytics", params.query as string, params);
      },
    },
  };
}
