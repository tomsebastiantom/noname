export interface EdgeSchemaResponse {
  siteId: string;
  layout: Record<string, unknown> | null;
  flags: Record<string, unknown>;
  segment: string | null;
}

export interface PersonalizeRequest {
  siteId: string;
  segment?: string;
  headers?: Record<string, string>;
  flagKeys?: string[];
}

export interface PersonalizeResponse {
  siteId: string;
  segment: string;
  layout: Record<string, unknown> | null;
  flags: Record<string, unknown>;
}

export interface EdgeService {
  getSchema(siteId: string, segment?: string): Promise<EdgeSchemaResponse>;
  personalize(tenantId: string, input: PersonalizeRequest): Promise<PersonalizeResponse>;
}
