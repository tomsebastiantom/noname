import { context, propagation, SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { getRedisConnection } from "../../shared/redis";
import type { AgentTaskStorage } from "./ports";
import type { AgentJobData } from "./queue";
import type { AgentExecutor } from "./tools";

const tracer = trace.getTracer("agent-worker");

export function startAgentWorker(
  storage: AgentTaskStorage,
  executor: AgentExecutor,
): Worker<AgentJobData> {
  const worker = new Worker<AgentJobData>(
    "agent-tasks",
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

            await storage.update(orgId, taskId, { status: "running" });

            try {
              const result = await executor.execute(orgId, type, prompt, input);
              span.setAttribute("agent.model", result.model);
              span.setAttribute("agent.tokens", result.tokens);
              await storage.update(orgId, taskId, {
                status: "completed",
                output: result.output,
                model: result.model,
                tokens: result.tokens,
              });
            } catch (err) {
              span.recordException(err as Error);
              span.setStatus({ code: SpanStatusCode.ERROR });
              await storage.update(orgId, taskId, {
                status: "failed",
                error: err instanceof Error ? err.message : "unknown error",
              });
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
