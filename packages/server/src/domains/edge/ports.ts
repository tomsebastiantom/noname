export type LayoutRenderAs = "standalone" | "shell" | "panel" | "editor";

export interface ExperienceAttribution {
  audienceKey: string;
  audienceDefinitionVersion: number;
  bindingId: string;
  bindingVersion: number;
  decisionId: string;
  pageKey: string;
  locale: string | null;
  schemaId: string;
  variantId: string;
}

export interface EdgeSchemaResponse {
  siteId: string;
  layout: Record<string, unknown> | null;
  /** Resolved layout template key (e.g. home) — for visual editor save target. */
  templateName: string;
  renderAs: LayoutRenderAs;
  shell: Record<string, unknown> | null;
  shellRef: string | null;
  flags: Record<string, unknown>;
  requestContext: { pageKey: string; locale: string | null };
  experience: ExperienceAttribution | null;
  /** Content entry merged into layout for this URL (e.g. product:uuid). */
  contentRef: string | null;
}

export interface GetSchemaOptions {
  template?: string;
  url?: string;
  contentRef?: string | null;
  locale?: string;
  /** Set only from the signed worker identity header verified by the server. */
  verifiedUserId?: string | null;
  /** Non-authoritative rollout key for anonymous percentage evaluation only. */
  sessionId?: string | null;
  /** Storefront visual editor — returns page layout + visual_editor shell. */
  edit?: boolean;
}

export interface EdgeService {
  getSchema(siteId: string, options?: GetSchemaOptions): Promise<EdgeSchemaResponse>;
  recordExperienceRendered(
    siteId: string,
    verifiedUserId: string,
    sessionId: string,
    decisionId: string,
  ): Promise<boolean>;
}
