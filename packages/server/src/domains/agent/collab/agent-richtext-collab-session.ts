import type { RichTextDocument } from "@noname/documents";
import { scheduleCollabTicketRefresh } from "../../collab/collab-ticket-refresh";
import { mintRichTextCollabTicket } from "../../collab/richtext-collab-ticket";
import {
  RichTextCollabWsClient,
  richTextCollabWsUrl,
} from "../../collab/richtext-collab-ws-client";
import { AgentRichTextYjsEditor } from "./agent-richtext-yjs-editor";

export type AgentRichTextCollabSessionOptions = {
  orgId: string;
  contentDocumentId: string;
  fieldKey: string;
  locale: string;
  userId: string;
  agentSlug: string;
  agentLabel?: string;
  port: number;
};

export class AgentRichTextCollabSession {
  private client: RichTextCollabWsClient | null = null;
  private editor: AgentRichTextYjsEditor | null = null;
  private cancelTicketRefresh: (() => void) | null = null;
  private readonly displayName: string;

  constructor(private readonly options: AgentRichTextCollabSessionOptions) {
    const label = options.agentLabel?.trim();
    this.displayName = label || (options.agentSlug ? `Agent: ${options.agentSlug}` : "Agent");
  }

  get contentDocumentId(): string {
    return this.options.contentDocumentId;
  }

  get fieldKey(): string {
    return this.options.fieldKey;
  }

  get locale(): string {
    return this.options.locale;
  }

  matches(contentDocumentId: string, fieldKey: string, locale: string): boolean {
    return (
      this.options.contentDocumentId === contentDocumentId &&
      this.options.fieldKey === fieldKey &&
      this.options.locale === locale
    );
  }

  async connect(): Promise<void> {
    await this.ensureReady();
    this.scheduleTicketRefresh();
  }

  async disconnect(): Promise<void> {
    this.cancelTicketRefresh?.();
    this.cancelTicketRefresh = null;
    this.editor?.destroy();
    this.editor = null;
    this.client?.destroy();
    this.client = null;
  }

  pulseAwareness(): void {
    this.client?.setAwarenessUser({
      name: this.displayName,
      color: "hsl(270 65% 50%)",
    });
    this.client?.pulseAwareness();
  }

  async applyRichTextDocument(doc: RichTextDocument): Promise<void> {
    await this.ensureReady();
    this.editor?.applyDocument(doc);
    this.pulseAwareness();
  }

  private async ensureReady(): Promise<void> {
    if (!this.client) {
      const url = this.buildWsUrl();
      this.client = new RichTextCollabWsClient(url);
      await this.client.connect();
      await this.client.whenSynced();
      this.editor = new AgentRichTextYjsEditor();
      this.editor.bind(this.client.doc, {
        awareness: this.client.awareness,
        user: {
          name: this.displayName,
          color: "hsl(270 65% 50%)",
        },
      });
      this.client.setAwarenessUser({
        name: this.displayName,
        color: "hsl(270 65% 50%)",
      });
      return;
    }

    if (!this.client.isConnected()) {
      await this.client.connect();
      await this.client.whenSynced();
    }
  }

  private buildWsUrl(): string {
    const { orgId, contentDocumentId, fieldKey, locale, userId, port } = this.options;
    const { ticket, roomName } = mintRichTextCollabTicket(
      userId,
      orgId,
      contentDocumentId,
      fieldKey,
      locale,
    );
    return richTextCollabWsUrl(port, roomName, ticket);
  }

  private scheduleTicketRefresh(): void {
    this.cancelTicketRefresh?.();
    this.cancelTicketRefresh = scheduleCollabTicketRefresh(async () => {
      try {
        if (!this.client) return;
        const url = this.buildWsUrl();
        await this.client.reconnect(url);
        await this.client.whenSynced();
        this.client.setAwarenessUser({
          name: this.displayName,
          color: "hsl(270 65% 50%)",
        });
        this.scheduleTicketRefresh();
      } catch (err) {
        console.error("[agent-collab] rich text ticket refresh failed", err);
      }
    });
  }
}
