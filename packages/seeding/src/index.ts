export type SeedLogLevel = "debug" | "info" | "warn" | "error";

export type SeedLogger = {
  log(level: SeedLogLevel, message: string, metadata?: Record<string, unknown>): void;
};

export type SeedContext = {
  profile: string;
  runId: string;
  orgId?: string;
  storeSlug?: string;
  apiBase?: string;
  dryRun: boolean;
  now: Date;
  logger: SeedLogger;
  metadata: Record<string, unknown>;
};

export type SeedStep = {
  id: string;
  dependsOn?: string[];
  run(context: SeedContext): Promise<void>;
};

export type SeedProfileInput = {
  profile: string;
  steps: SeedStep[];
  context: Omit<SeedContext, "profile"> & { profile?: string };
};

export type SeedStepResult = {
  id: string;
  status: "completed";
};

export type SeedProfileResult = {
  profile: string;
  runId: string;
  steps: SeedStepResult[];
};

export const consoleSeedLogger: SeedLogger = {
  log(level, message, metadata) {
    const suffix =
      metadata && Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : "";
    const line = `[seed:${level}] ${message}${suffix}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  },
};

export function createSeedContext(
  input: Omit<SeedContext, "logger" | "metadata" | "profile"> & {
    profile: string;
    logger?: SeedLogger;
    metadata?: Record<string, unknown>;
  },
): SeedContext {
  return {
    ...input,
    logger: input.logger ?? consoleSeedLogger,
    metadata: input.metadata ?? {},
  };
}

export async function runSeedProfile(input: SeedProfileInput): Promise<SeedProfileResult> {
  const profile = input.context.profile ?? input.profile;
  const context: SeedContext = { ...input.context, profile };
  const stepsById = new Map(input.steps.map((step) => [step.id, step]));
  const completed = new Set<string>();
  const visiting = new Set<string>();
  const results: SeedStepResult[] = [];

  async function runStep(id: string): Promise<void> {
    if (completed.has(id)) return;
    if (visiting.has(id)) {
      throw new Error(`Seed dependency cycle detected at "${id}"`);
    }
    const step = stepsById.get(id);
    if (!step) throw new Error(`Seed step "${id}" is not registered`);
    visiting.add(id);
    for (const dependency of step.dependsOn ?? []) await runStep(dependency);
    context.logger.log("info", `starting ${context.profile}/${step.id}`);
    await step.run(context);
    context.logger.log("info", `completed ${context.profile}/${step.id}`);
    visiting.delete(id);
    completed.add(id);
    results.push({ id: step.id, status: "completed" });
  }

  for (const step of input.steps) await runStep(step.id);
  return { profile: context.profile, runId: context.runId, steps: results };
}

export function deterministicSeedId(namespace: string, value: string): string {
  return `${namespace}:${value}`;
}
