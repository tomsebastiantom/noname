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

export interface GetSchemaOptions {
  segment?: string;
  template?: string;
  contentRef?: string | null;
  locale?: string;
}

export interface EdgeService {
  getSchema(siteId: string, options?: GetSchemaOptions): Promise<EdgeSchemaResponse>;
  personalize(orgId: string, input: PersonalizeRequest): Promise<PersonalizeResponse>;
}
