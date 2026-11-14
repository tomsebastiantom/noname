import type { Database } from "../../../drizzle";
import { aiGenerations } from "../schema";

export interface AIGenerationStorage {
  insert(input: {
    id: string;
    orgId: string;
    prompt: string;
    response: unknown;
    model: string;
    tokens: number;
    targetType: string;
  }): Promise<void>;
}

export function createAIGenerationStorage(db: Database): AIGenerationStorage {
  return {
    async insert(input) {
      await db.insert(aiGenerations).values({
        id: input.id,
        orgId: input.orgId,
        prompt: input.prompt,
        response: input.response,
        model: input.model,
        tokens: input.tokens,
        targetType: input.targetType,
      });
    },
  };
}
