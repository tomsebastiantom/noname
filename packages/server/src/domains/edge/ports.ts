export type LayoutRenderAs = "standalone" | "shell" | "panel";

export interface EdgeSchemaResponse {
  siteId: string;
  layout: Record<string, unknown> | null;
  /** Resolved layout template key (e.g. home) — for visual editor save target. */
  templateName: string;
  renderAs: LayoutRenderAs;
  shell: Record<string, unknown> | null;
  shellRef: string | null;
  flags: Record<string, unknown>;
  segment: string | null;
  /** Content entry merged into layout for this URL (e.g. product:uuid). */
  contentRef: string | null;
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
  url?: string;
  contentRef?: string | null;
  locale?: string;
}

export interface EdgeService {
  getSchema(siteId: string, options?: GetSchemaOptions): Promise<EdgeSchemaResponse>;
  personalize(orgId: string, input: PersonalizeRequest): Promise<PersonalizeResponse>;
}
