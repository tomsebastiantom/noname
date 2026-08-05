import { context, propagation, SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";
import type { AgentRegistryStorage } from "./adapters/registry-postgres";
import { AgentTask } from "./entity";
import type { AgentTaskStorage } from "./ports";
import type { AgentJobData } from "./queue";
import { requireAgentTask } from "./task-guards";
import { persistAgentTask } from "./task-lifecycle";
import type { AgentExecutor } from "./tools";

export interface AgentWorkerDeps extends AgentWorkerHooks {
  registryStorage?: AgentRegistryStorage;
}

export interface AgentTaskCompletedContext {
  orgId: string;
  taskId: string;
  type: string;
  prompt: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  model: string;
  tokens: number;
}

export interface AgentWorkerHooks {
  onTaskCompleted?: (ctx: AgentTaskCompletedContext) => Promise<void>;
}

const tracer = trace.getTracer("agent-worker");

export function startAgentWorker(
  storage: AgentTaskStorage,
  executor: AgentExecutor,
  deps: AgentWorkerDeps = {},
): Worker<AgentJobData> {
  const worker = new Worker<AgentJobData>(
    BULLMQ_QUEUES.AGENT,
    async (job) => {
      const { taskId, orgId, type, prompt, input, traceparent, tracestate } = job.data;

      const parentContext = traceparent
        ? propagation.extract(context.active(), { traceparent, tracestate })
        : context.active();

      return context.with(parentContext, () =>
        tracer.startActiveSpan(`agent.${type}`, async (span) => {
          try {
            span.setAttribute("agent.task_id", taskId);
            span.setAttribute("agent.org_id", orgId);
            span.setAttribute("agent.type", type);

            const row = await requireAgentTask(storage, orgId, taskId);
            const entity = AgentTask.fromDTO(row);
            entity.start();
            await persistAgentTask(storage, orgId, entity);

            try {
              let executorInput: Record<string, unknown> = { ...input, taskId };
              if (row.registeredAgentId) {
                executorInput.registeredAgentId = row.registeredAgentId;
              }
              if (deps.registryStorage && row.registeredAgentId) {
                const agent = await deps.registryStorage.findById(orgId, row.registeredAgentId);
                if (agent) {
                  executorInput = {
                    ...executorInput,
                    agentSlug: agent.slug,
                    onBehalfOf: agent.ownerUserId,
                    ...(agent.allowedTools.length > 0 ? { allowedTools: agent.allowedTools } : {}),
                  };
                }
              }

              const result = await executor.execute(orgId, type, prompt, executorInput);
              span.setAttribute("agent.model", result.model);
              span.setAttribute("agent.tokens", result.tokens);
              entity.complete(result.output, result.model, result.tokens);
              await persistAgentTask(storage, orgId, entity);
              if (deps.onTaskCompleted) {
                await deps.onTaskCompleted({
                  orgId,
                  taskId,
                  type,
                  prompt,
                  input,
                  output: result.output,
                  model: result.model,
                  tokens: result.tokens,
                });
              }
            } catch (err) {
              span.recordException(err as Error);
              span.setStatus({ code: SpanStatusCode.ERROR });
              entity.fail(err instanceof Error ? err.message : "unknown error");
              await persistAgentTask(storage, orgId, entity);
              throw err;
            }
          } finally {
            span.end();
          }
        }),
      );
    },
    {
      connection: getRedisConnection(),
      concurrency: 4,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  );

  return worker;
}
