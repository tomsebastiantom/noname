export interface AISpecDTO {
  id: string;
  tenantId: string;
  prompt: string;
  response: unknown;
  model: string;
  tokens: number;
  createdAt: Date;
}

export interface AIPipeline {
  generateLayout(
    tenantId: string,
    prompt: string,
    context: Record<string, unknown>,
  ): Promise<AISpecDTO>;
  generateContent(tenantId: string, contentType: string, prompt: string): Promise<AISpecDTO>;
  generateMachine(tenantId: string, machineName: string, description: string): Promise<AISpecDTO>;
}
