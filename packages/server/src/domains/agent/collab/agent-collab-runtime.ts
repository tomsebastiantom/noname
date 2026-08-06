import {
  AgentLayoutCollabSession,
  type AgentLayoutCollabSessionOptions,
} from "./agent-layout-collab-session";
import {
  AgentRichTextCollabSession,
  type AgentRichTextCollabSessionOptions,
} from "./agent-richtext-collab-session";

export function createAgentCollabRuntime() {
  let layoutSession: AgentLayoutCollabSession | null = null;
  let richTextSession: AgentRichTextCollabSession | null = null;

  return {
    async openLayoutSession(
      options: AgentLayoutCollabSessionOptions,
    ): Promise<AgentLayoutCollabSession> {
      if (layoutSession) {
        await layoutSession.disconnect();
      }
      layoutSession = new AgentLayoutCollabSession(options);
      await layoutSession.connect();
      return layoutSession;
    },

    async openRichTextSession(
      options: AgentRichTextCollabSessionOptions,
    ): Promise<AgentRichTextCollabSession> {
      if (richTextSession) {
        await richTextSession.disconnect();
      }
      richTextSession = new AgentRichTextCollabSession(options);
      await richTextSession.connect();
      return richTextSession;
    },

    async ensureLayoutSession(
      options: AgentLayoutCollabSessionOptions,
    ): Promise<AgentLayoutCollabSession | null> {
      if (layoutSession?.layoutDocumentId === options.layoutDocumentId) {
        return layoutSession;
      }
      try {
        return await this.openLayoutSession(options);
      } catch (err) {
        console.error("[agent-collab] ensure layout session failed", err);
        return null;
      }
    },

    getLayoutSession(): AgentLayoutCollabSession | null {
      return layoutSession;
    },

    getRichTextSession(): AgentRichTextCollabSession | null {
      return richTextSession;
    },

    hasLayoutSession(): boolean {
      return layoutSession !== null;
    },

    hasRichTextSession(): boolean {
      return richTextSession !== null;
    },

    async close(): Promise<void> {
      if (layoutSession) {
        await layoutSession.disconnect();
        layoutSession = null;
      }
      if (richTextSession) {
        await richTextSession.disconnect();
        richTextSession = null;
      }
    },
  };
}

export type AgentCollabRuntime = ReturnType<typeof createAgentCollabRuntime>;
