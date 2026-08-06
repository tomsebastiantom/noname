import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentTask,
  approveAgentTask,
  createAgentTask,
  fetchAgentTaskById,
  fetchAgentTasksForLayout,
  fetchRegisteredAgents,
  parseOrchestrateOutput,
  type RegisteredAgent,
  rejectAgentTask,
} from "../../auth/agents";
import {
  type AgentThreadEntry,
  agentThreadFromTasks,
  filterAgentTasksSince,
} from "../agent/agent-thread-from-tasks";
import { buildConversationHistory } from "../agent/build-conversation-history";
import type { AgentTargetField } from "../hooks/editor-session";

export type { AgentThreadEntry };

export function useEditorAgentPanel({
  enabled,
  layoutDocumentId,
  contentDocumentId,
  targetFieldKey,
  targetLocale,
  templateName,
  selectedComponentType,
  agentTargetField,
  chatClearedAt,
  onClearChat,
  onLayoutPatched,
  onLayoutReverted,
}: {
  enabled: boolean;
  layoutDocumentId: string | null;
  contentDocumentId: string | null;
  targetFieldKey?: string | null;
  targetLocale?: string | null;
  templateName: string;
  selectedComponentType: string | null;
  agentTargetField: AgentTargetField | null;
  chatClearedAt: string | null;
  onClearChat: () => void;
  onLayoutPatched?: () => void | Promise<void>;
  onLayoutReverted?: (spec: Record<string, unknown>) => void;
}) {
  const [agents, setAgents] = useState<RegisteredAgent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<AgentThreadEntry[]>([]);
  const [tasksById, setTasksById] = useState<Record<string, AgentTask>>({});
  const [reviewPending, setReviewPending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const hydratedKeyRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const prevThreadLenRef = useRef(0);
  const liveScrollSignatureRef = useRef("");
  const layoutSyncedTaskIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!onLayoutPatched) return;
    for (const entry of thread) {
      const task = tasksById[entry.taskId];
      if (!task) continue;
      if (task.status !== "completed" && task.status !== "approved" && task.status !== "running") {
        continue;
      }
      const orchestrate = parseOrchestrateOutput(task.output);
      const patched =
        orchestrate?.steps.some(
          (step) => step.tool === "patchLayoutDraft" && step.status === "ok",
        ) ?? false;
      if (!patched) continue;
      if (layoutSyncedTaskIdsRef.current.has(task.id)) continue;
      layoutSyncedTaskIdsRef.current.add(task.id);
      void onLayoutPatched();
    }
  }, [thread, tasksById, onLayoutPatched]);

  const richTextTarget = agentTargetField?.fieldType === "richText" ? agentTargetField : null;
  const resolvedFieldKey = targetFieldKey ?? richTextTarget?.fieldKey ?? null;
  const resolvedLocale = targetLocale ?? richTextTarget?.locale ?? null;

  const activeTaskIds = useMemo(() => {
    return thread
      .map((entry) => tasksById[entry.taskId])
      .filter((task): task is AgentTask => Boolean(task))
      .filter((task) => task.status === "pending" || task.status === "running")
      .map((task) => task.id);
  }, [thread, tasksById]);

  useEffect(() => {
    if (!enabled) return;
    setLoadingAgents(true);
    setError(null);
    void fetchRegisteredAgents()
      .then((rows) => {
        setAgents(rows);
        setAgentId((current) => {
          if (current) return current;
          return rows.length === 1 ? rows[0]!.id : current;
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoadingAgents(false));
  }, [enabled]);

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior) => {
    const el = threadScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 96;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (thread.length > prevThreadLenRef.current) {
      prevThreadLenRef.current = thread.length;
      scrollThreadToBottom("smooth");
      stickToBottomRef.current = true;
      return;
    }
    prevThreadLenRef.current = thread.length;
  }, [thread.length, scrollThreadToBottom]);

  useEffect(() => {
    if (activeTaskIds.length === 0) return;
    const lastEntry = thread[thread.length - 1];
    if (!lastEntry) return;
    const task = tasksById[lastEntry.taskId];
    if (!task) return;
    const signature = `${task.status}:${task.error ?? ""}:${JSON.stringify(task.output ?? null)}`;
    if (signature === liveScrollSignatureRef.current) return;
    liveScrollSignatureRef.current = signature;
    if (stickToBottomRef.current) {
      scrollThreadToBottom("auto");
    }
  }, [activeTaskIds.length, tasksById, thread, scrollThreadToBottom]);

  useEffect(() => {
    if (!enabled) {
      hydratedKeyRef.current = null;
      return;
    }
    if (!layoutDocumentId) {
      setThread([]);
      setTasksById({});
      hydratedKeyRef.current = null;
      return;
    }
    const hydrateKey = `${layoutDocumentId}:${chatClearedAt ?? ""}`;
    if (hydratedKeyRef.current === hydrateKey) return;

    setThread([]);
    setTasksById({});
    let cancelled = false;
    setLoadingThread(true);
    setError(null);
    void fetchAgentTasksForLayout(layoutDocumentId)
      .then((tasks) => {
        if (cancelled) return;
        const visible = filterAgentTasksSince(tasks, chatClearedAt);
        const { thread: restored, tasksById: restoredTasks } = agentThreadFromTasks(visible);
        setThread(restored);
        setTasksById(restoredTasks);
        prevThreadLenRef.current = restored.length;
        liveScrollSignatureRef.current = "";
        const lastWithAgent = [...visible]
          .reverse()
          .find((task) => task.registeredAgentId)?.registeredAgentId;
        if (lastWithAgent) {
          setAgentId(lastWithAgent);
        }
        hydratedKeyRef.current = hydrateKey;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, layoutDocumentId, chatClearedAt]);

  const refreshTask = useCallback(async (taskId: string) => {
    const task = await fetchAgentTaskById(taskId);
    setTasksById((current) => ({ ...current, [taskId]: task }));
    return task;
  }, []);

  useEffect(() => {
    if (activeTaskIds.length === 0) return;
    const timer = window.setInterval(() => {
      for (const taskId of activeTaskIds) {
        void refreshTask(taskId).catch(() => {
          // Polling errors surface on next manual refresh.
        });
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [activeTaskIds, refreshTask]);

  const submitPromptForText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!layoutDocumentId || !agentId || !trimmed) return;
      setSubmitting(true);
      setError(null);
      try {
        const conversationHistory = buildConversationHistory(thread, tasksById);
        const task = await createAgentTask({
          type: "orchestrate",
          prompt: trimmed,
          registeredAgentId: agentId,
          input: {
            targetLayoutDocumentId: layoutDocumentId,
            ...(contentDocumentId ? { targetContentDocumentId: contentDocumentId } : {}),
            ...(resolvedFieldKey ? { targetFieldKey: resolvedFieldKey } : {}),
            ...(resolvedLocale ? { targetLocale: resolvedLocale } : {}),
            ...(conversationHistory.length > 0 ? { conversationHistory } : {}),
            pageContext: {
              ...(templateName ? { templateName } : {}),
              ...(selectedComponentType ? { componentType: selectedComponentType } : {}),
              ...(richTextTarget?.fieldLabel ? { fieldLabel: richTextTarget.fieldLabel } : {}),
            },
          },
        });
        const entry: AgentThreadEntry = {
          id: task.id,
          role: "user",
          content: trimmed,
          taskId: task.id,
          at: task.createdAt,
        };
        setThread((current) => [...current, entry]);
        setTasksById((current) => ({ ...current, [task.id]: task }));
        setPrompt("");
        void refreshTask(task.id).catch(() => {});
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [
      agentId,
      contentDocumentId,
      layoutDocumentId,
      refreshTask,
      resolvedFieldKey,
      resolvedLocale,
      selectedComponentType,
      templateName,
      thread,
      tasksById,
      richTextTarget?.fieldLabel,
    ],
  );

  const submitPrompt = useCallback(async () => {
    await submitPromptForText(prompt);
  }, [prompt, submitPromptForText]);

  const retryFailedTask = useCallback(
    async (taskId: string) => {
      const entry = thread.find((item) => item.taskId === taskId);
      if (!entry) return;
      await submitPromptForText(entry.content);
    },
    [submitPromptForText, thread],
  );

  const approveTask = useCallback(async (taskId: string) => {
    setReviewPending(true);
    setError(null);
    try {
      const task = await approveAgentTask(taskId);
      setTasksById((current) => ({ ...current, [taskId]: task }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewPending(false);
    }
  }, []);

  const rejectTask = useCallback(
    async (taskId: string) => {
      setReviewPending(true);
      setError(null);
      try {
        const result = await rejectAgentTask(taskId);
        const { revertedLayouts, ...task } = result;
        setTasksById((current) => ({ ...current, [taskId]: task }));
        const reverted = revertedLayouts?.find((row) => row.layoutDocumentId === layoutDocumentId);
        if (reverted?.spec && onLayoutReverted) {
          onLayoutReverted(reverted.spec);
        }
        if (onLayoutPatched) {
          layoutSyncedTaskIdsRef.current.delete(taskId);
          await onLayoutPatched();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setReviewPending(false);
      }
    },
    [layoutDocumentId, onLayoutPatched, onLayoutReverted],
  );

  const clearChat = useCallback(() => {
    onClearChat();
    setThread([]);
    setTasksById({});
    prevThreadLenRef.current = 0;
    liveScrollSignatureRef.current = "";
    stickToBottomRef.current = true;
  }, [onClearChat]);

  return {
    agents,
    loadingAgents,
    agentId,
    setAgentId,
    prompt,
    setPrompt,
    submitting,
    error,
    loadingThread,
    thread,
    tasksById,
    submitPrompt,
    retryFailedTask,
    approveTask,
    rejectTask,
    reviewPending,
    threadScrollRef,
    threadEndRef,
    clearChat,
    canClearChat: thread.length > 0 && !submitting,
    richTextTarget,
    canSubmit: Boolean(layoutDocumentId && agentId && prompt.trim()),
  };
}
