import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { AIPipeline } from "./ports";
import { createLLMProvider } from "./providers";

const tracer = trace.getTracer("ai-pipeline");

export function createAIPipeline(): AIPipeline {
  const provider = createLLMProvider();

  async function callLLM(
    tenantId: string,
    prompt: string,
    targetType: "layout" | "content" | "machine",
    context: Record<string, unknown>,
  ): Promise<{
    id: string;
    tenantId: string;
    prompt: string;
    response: unknown;
    model: string;
    tokens: number;
    createdAt: Date;
  }> {
    return tracer.startActiveSpan(`ai.${targetType}`, async (span) => {
      try {
        span.setAttribute("ai.tenant_id", tenantId);
        span.setAttribute("ai.operation", targetType);
        span.setAttribute("ai.prompt_length", prompt.length);

        const id = crypto.randomUUID();
        const result = await provider.generate({
          prompt,
          targetType,
          context,
        });

        span.setAttribute("ai.model", result.model);
        span.setAttribute("ai.tokens", result.tokens);

        return {
          id,
          tenantId,
          prompt,
          response: result.response,
          model: result.model,
          tokens: result.tokens,
          createdAt: new Date(),
        };
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  return {
    async generateLayout(tenantId, prompt, context) {
      return callLLM(tenantId, prompt, "layout", context);
    },

    async generateContent(tenantId, _contentType, prompt) {
      return callLLM(tenantId, prompt, "content", {});
    },

    async generateMachine(tenantId, _machineName, description) {
      return callLLM(tenantId, description, "machine", {});
    },
  };
}
