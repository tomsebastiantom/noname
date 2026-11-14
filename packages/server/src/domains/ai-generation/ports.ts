export interface AISpecDTO {
  id: string;
  orgId: string;
  prompt: string;
  response: unknown;
  model: string;
  tokens: number;
  createdAt: Date;
}

export interface AIPipeline {
  generateLayout(
    orgId: string,
    prompt: string,
    context: Record<string, unknown>,
  ): Promise<AISpecDTO>;
  generateContent(orgId: string, contentType: string, prompt: string): Promise<AISpecDTO>;
  generateMachine(orgId: string, machineName: string, description: string): Promise<AISpecDTO>;
}
