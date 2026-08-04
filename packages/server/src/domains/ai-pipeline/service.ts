import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { SecretsService } from "../secrets/ports";
import type { AIPipeline } from "./ports";
import { createLLMProvider } from "./providers";

const tracer = trace.getTracer("ai-pipeline");

export function createAIPipeline(
  deps: { secrets?: Pick<SecretsService, "resolveLLMProvider"> } = {},
): AIPipeline {
  const resolveProvider = deps.secrets?.resolveLLMProvider ?? (async () => createLLMProvider());

  async function callLLM(
    orgId: string,
    prompt: string,
    targetType: "layout" | "content" | "machine",
    context: Record<string, unknown>,
  ): Promise<{
    id: string;
    orgId: string;
    prompt: string;
    response: unknown;
    model: string;
    tokens: number;
    createdAt: Date;
  }> {
    return tracer.startActiveSpan(`ai.${targetType}`, async (span) => {
      try {
        span.setAttribute("ai.org_id", orgId);
        span.setAttribute("ai.operation", targetType);
        span.setAttribute("ai.prompt_length", prompt.length);

        const id = crypto.randomUUID();
        const provider = await resolveProvider(orgId);
        const result = await provider.generate({
          prompt,
          targetType,
          context,
        });

        span.setAttribute("ai.model", result.model);
        span.setAttribute("ai.tokens", result.tokens);

        return {
          id,
          orgId,
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
    async generateLayout(orgId, prompt, context) {
      return callLLM(orgId, prompt, "layout", context);
    },

    async generateContent(orgId, _contentType, prompt) {
      return callLLM(orgId, prompt, "content", {});
    },

    async generateMachine(orgId, _machineName, description) {
      return callLLM(orgId, description, "machine", {});
    },
  };
}
