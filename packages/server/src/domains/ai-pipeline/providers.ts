export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  targetType: "layout" | "content" | "machine";
  context?: Record<string, unknown>;
  maxTokens?: number;
}

export interface LLMResponse {
  response: unknown;
  model: string;
  tokens: number;
}

export interface LLMProvider {
  generate(req: LLMRequest): Promise<LLMResponse>;
}

export function createLLMProvider(): LLMProvider {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) return createOpenAIProvider(openaiKey);
  if (anthropicKey) return createAnthropicProvider(anthropicKey);

  return createMockProvider();
}

export function createLLMProviderForApiKey(
  provider: "openai" | "anthropic",
  apiKey: string,
): LLMProvider {
  if (provider === "openai") return createOpenAIProvider(apiKey);
  return createAnthropicProvider(apiKey);
}

function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    async generate(req) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: buildSystemPrompt(req.targetType) },
            { role: "user", content: req.prompt },
          ],
          max_tokens: req.maxTokens ?? 2000,
          response_format: { type: "json_object" },
        }),
      });

      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content ?? "{}";

      return {
        response: JSON.parse(content),
        model: data.model ?? "gpt-4o",
        tokens: data.usage?.total_tokens ?? 0,
      };
    },
  };
}

function createAnthropicProvider(apiKey: string): LLMProvider {
  return {
    async generate(req) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: req.maxTokens ?? 2000,
          system: buildSystemPrompt(req.targetType),
          messages: [{ role: "user", content: `${req.prompt}\n\nRespond with valid JSON only.` }],
        }),
      });

      const data = (await response.json()) as any;
      const content = data.content?.[0]?.text ?? "{}";

      return {
        response: JSON.parse(extractJson(content)),
        model: data.model ?? "claude-sonnet-4-20250514",
        tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      };
    },
  };
}

function createMockProvider(): LLMProvider {
  return {
    async generate(req) {
      return {
        response: mockResponse(req.targetType, req.prompt),
        model: "mock",
        tokens: 0,
      };
    },
  };
}

function buildSystemPrompt(targetType: string): string {
  const base = "You are a JSON generator for a platform called noname. ";

  switch (targetType) {
    case "layout":
      return `${base}Generate json-render layout specs. The response must be valid JSON with a root element and children. Use these component types: container, heading, text, image, button, grid, card. Each element has: type (string), props (object), children (array, optional).`;
    case "content":
      return `${base}Generate content entries as JSON objects. Fields depend on content type. Common fields: title (string), body (string), slug (string), image (string), tags (string array).`;
    case "machine":
      return `${base}Generate XState machine definitions as JSON. Required fields: id (string), initial (string), states (object). Each state has: on (object mapping event names to { target: stateName }). Use states like: idle, active, pending, completed, failed, cancelled.`;
    default:
      return `${base}Respond with valid JSON only.`;
  }
}

function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : "{}";
}

function mockResponse(targetType: string, prompt: string): unknown {
  switch (targetType) {
    case "layout":
      return {
        type: "container",
        props: { style: "flex flex-col gap-4 p-4" },
        children: [
          { type: "heading", props: { text: "Generated Layout", level: 1 } },
          { type: "text", props: { content: prompt.slice(0, 100) } },
        ],
      };
    case "content":
      return {
        title: "Generated Content",
        body: prompt.slice(0, 200),
        slug: prompt.toLowerCase().replace(/\s+/g, "-").slice(0, 50),
      };
    case "machine":
      return {
        id: crypto.randomUUID(),
        name: prompt.split(" ").slice(0, 3).join("_"),
        initial: "idle",
        states: {
          idle: { on: { start: { target: "active" } } },
          active: { on: { complete: { target: "done" } } },
          done: { type: "final" },
        },
      };
    default:
      return { message: prompt.slice(0, 100) };
  }
}
