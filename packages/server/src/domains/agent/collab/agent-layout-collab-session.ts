import {
  type AnyDocumentId,
  type DocHandle,
  interpretAsDocumentId,
  Repo,
} from "@automerge/automerge-repo/slim";
import {
  type AutomergeSpecDoc,
  applyLocalSpecToDraft,
  automergeDocToSpec,
} from "../../collab/automerge-spec";
import { awaitCollabDocHandle } from "../../collab/await-collab-doc-handle";
import { mintCollabTicket } from "../../collab/collab-ticket";
import { LayoutCollabWsClient, layoutCollabWsUrl } from "../../collab/layout-collab-ws-client";
import { serializeCollabPresenceClientMessage } from "../../collab/presence";
import { validateSpec } from "../../documents/services/layout-helpers";
import { formatCollabApplyError } from "./collab-apply-error";

export type AgentLayoutCollabSessionOptions = {
  orgId: string;
  layoutDocumentId: string;
  userId: string;
  agentSlug: string;
  agentLabel?: string;
  port: number;
};

const COLLAB_CONNECT_TIMEOUT_MS = 20_000;
const PRESENCE_RETRY_MS = [0, 400, 1_200] as const;

async function whenAdapterReady(
  adapter: LayoutCollabWsClient,
  timeoutMs = COLLAB_CONNECT_TIMEOUT_MS,
): Promise<void> {
  await Promise.race([
    adapter.whenReady(),
    new Promise<never>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`Layout collab WS timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    }),
  ]);
}

function inferFocusElementId(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): string | null {
  const prevEls = (prev.elements ?? {}) as Record<string, unknown>;
  const nextEls = (next.elements ?? {}) as Record<string, unknown>;
  for (const id of Object.keys(nextEls)) {
    if (JSON.stringify(prevEls[id]) !== JSON.stringify(nextEls[id])) {
      return id;
    }
  }
  return typeof next.root === "string" ? next.root : null;
}

export class AgentLayoutCollabSession {
  private adapter: LayoutCollabWsClient | null = null;
  private repo: Repo | null = null;
  private handle: DocHandle<Record<string, unknown>> | null = null;
  private lastPresence: {
    selectedElementId: string | null;
    cursorX: number | null;
    cursorY: number | null;
  } = { selectedElementId: null, cursorX: null, cursorY: null };
  private presenceRetryTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly displayName: string;

  constructor(private readonly options: AgentLayoutCollabSessionOptions) {
    const label = options.agentLabel?.trim();
    this.displayName = label || (options.agentSlug ? `Agent: ${options.agentSlug}` : "Agent");
  }

  private clearPresenceRetries(): void {
    for (const timer of this.presenceRetryTimers) {
      clearTimeout(timer);
    }
    this.presenceRetryTimers = [];
  }

  private schedulePresenceRetries(): void {
    this.clearPresenceRetries();
    for (const delayMs of PRESENCE_RETRY_MS) {
      const timer = setTimeout(() => {
        this.sendPresence(this.lastPresence);
      }, delayMs);
      this.presenceRetryTimers.push(timer);
    }
  }

  get layoutDocumentId(): string {
    return this.options.layoutDocumentId;
  }

  async connect(): Promise<void> {
    try {
      await this.openConnection();
    } catch (err) {
      throw new Error(formatCollabApplyError(err));
    }
  }

  async disconnect(): Promise<void> {
    this.clearPresenceRetries();
    this.handle = null;
    const repo = this.repo;
    const adapter = this.adapter;
    this.repo = null;
    this.adapter = null;
    if (repo) {
      try {
        await repo.shutdown();
      } catch (err) {
        console.error("[agent-collab] layout repo shutdown failed", err);
      }
    }
    try {
      adapter?.disconnect();
    } catch (err) {
      console.error("[agent-collab] layout adapter disconnect failed", err);
    }
  }

  currentSpec(): Record<string, unknown> {
    const handle = this.handle;
    if (!handle) {
      throw new Error("Layout collab session not connected");
    }
    return automergeDocToSpec(handle.doc() as AutomergeSpecDoc);
  }

  /** Presence only — live spec edits use the server collab room handle. */
  focusElement(
    focusElementId?: string | null,
    prev?: Record<string, unknown>,
    next?: Record<string, unknown>,
  ): void {
    const focusId =
      focusElementId ?? (prev && next ? inferFocusElementId(prev, next) : null);
    this.sendPresence({ selectedElementId: focusId, cursorX: null, cursorY: null });
  }

  applySpec(
    next: Record<string, unknown>,
    focusElementId?: string | null,
  ): Record<string, unknown> {
    const handle = this.handle;
    if (!handle) {
      throw new Error("Layout collab session not connected");
    }
    validateSpec(next);

    const prev = automergeDocToSpec(handle.doc() as AutomergeSpecDoc);
    try {
      handle.change((draft) => {
        applyLocalSpecToDraft(draft as AutomergeSpecDoc, prev, next);
      });
    } catch (err) {
      throw new Error(formatCollabApplyError(err));
    }

    this.focusElement(focusElementId ?? null, prev, next);

    return next;
  }

  private sendPresence(update: {
    selectedElementId: string | null;
    cursorX: number | null;
    cursorY: number | null;
  }): void {
    this.lastPresence = update;
    this.adapter?.sendPresence(
      serializeCollabPresenceClientMessage({
        type: "presence",
        peerKind: "agent",
        displayName: this.displayName,
        ...update,
      }),
    );
  }

  private async openConnection(): Promise<void> {
    const { orgId, layoutDocumentId, userId, port } = this.options;
    const previousAdapter = this.adapter;
    const previousRepo = this.repo;

    this.adapter = null;
    this.repo = null;
    this.handle = null;

    if (previousRepo) {
      try {
        await previousRepo.shutdown();
      } catch (err) {
        console.error("[agent-collab] previous layout repo shutdown failed", err);
      }
    }
    if (previousAdapter) {
      try {
        previousAdapter.disconnect();
      } catch (err) {
        console.error("[agent-collab] previous layout adapter disconnect failed", err);
      }
    }

    const { ticket } = mintCollabTicket(userId, orgId, layoutDocumentId, {
      peerKind: "agent",
      displayName: this.displayName,
    });
    const adapter = new LayoutCollabWsClient(layoutCollabWsUrl(port, ticket));

    this.adapter = adapter;
    const repo = new Repo({ network: [adapter] });
    this.repo = repo;

    const documentId = interpretAsDocumentId(layoutDocumentId as AnyDocumentId);
    const handle = await awaitCollabDocHandle<Record<string, unknown>>(repo, documentId);
    this.handle = handle;

    await whenAdapterReady(adapter);
    this.sendPresence(this.lastPresence);
    this.schedulePresenceRetries();
  }
}
