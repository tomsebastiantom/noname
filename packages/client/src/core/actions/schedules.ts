import { ADMIN_STATE } from "../admin-state";
import { apiFetchData, apiFetchVoid } from "../../lib/api";
import type { CatalogActionHandler } from "./types";

/**
 * Schedule actions — read, run, pause, adjust.
 *
 * There is deliberately no "create schedule" action: definitions live in `definitions.ts` because a schedule is
 * behaviour and behaviour is reviewed. The panel says so instead of offering a form that could never be honest.
 */
const STATE = ADMIN_STATE.schedules;

async function loadSchedules(setState: (path: string, value: unknown) => void): Promise<void> {
  setState(STATE.loading, true);
  setState(STATE.error, null);
  try {
    // The panel needs both halves: the schedules to show and the definitions it may create from.
    const data = await apiFetchData<{ schedules?: unknown[]; definitions?: unknown[] }>(
      "/api/platform/schedules",
    );
    setState(STATE.list, { schedules: data.schedules ?? [], definitions: data.definitions ?? [] });
  } catch (cause) {
    setState(STATE.error, cause instanceof Error ? cause.message : "Failed to load schedules");
    setState(STATE.list, { schedules: [], definitions: [] });
  } finally {
    setState(STATE.loading, false);
  }
}

export const scheduleActions = {
  loadSchedules: (async (_params, setState) => {
    await loadSchedules(setState);
  }) satisfies CatalogActionHandler,

  runSchedule: (async (params, setState) => {
    const name = String((params as { id?: string }).id ?? "");
    if (!name) return;
    setState(STATE.notice, null);
    try {
      const result = await apiFetchData<{ items: number; dryRun: boolean }>(
        `/api/platform/schedules/${encodeURIComponent(name)}/run`,
        { method: "POST" },
      );
      setState(
        STATE.notice,
        result.dryRun
          ? `${name}: dry run — ${result.items} item(s) would be affected.`
          : `${name}: ${result.items} item(s) processed.`,
      );
      await loadSchedules(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Run failed");
    }
  }) satisfies CatalogActionHandler,

  pauseSchedule: (async (params, setState) => {
    const { id: name, paused } = params as { id?: string; paused?: boolean };
    if (!name) return;
    try {
      await apiFetchVoid(`/api/platform/schedules/${encodeURIComponent(name)}/${paused ? "pause" : "resume"}`, {
        method: "POST",
      });
      setState(STATE.notice, paused ? `${name} paused.` : `${name} resumed.`);
      await loadSchedules(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Pause failed");
    }
  }) satisfies CatalogActionHandler,

  setSchedulePattern: (async (params, setState) => {
    const { id: name, pattern } = params as { id?: string; pattern?: string | null };
    if (!name) return;
    try {
      await apiFetchVoid(`/api/platform/schedules/${encodeURIComponent(name)}/pattern`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: pattern?.trim() ? pattern.trim() : null }),
      });
      setState(STATE.notice, `Rescheduled to ${pattern}.`);
      await loadSchedules(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Pattern change failed");
    }
  }) satisfies CatalogActionHandler,

  setScheduleDryRun: (async (params, setState) => {
    const { id: name, dryRun } = params as { id?: string; dryRun?: boolean };
    if (!name) return;
    try {
      await apiFetchVoid(`/api/platform/schedules/${encodeURIComponent(name)}/dry-run`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: Boolean(dryRun) }),
      });
      setState(
        STATE.notice,
        dryRun ? "Back to dry run." : "This schedule will now make changes.",
      );
      await loadSchedules(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Dry-run change failed");
    }
  }) satisfies CatalogActionHandler,
};

export const scheduleCreateActions = {
  createSchedule: (async (params, setState) => {
    const { definition, pattern, label } = params as {
      definition?: string;
      pattern?: string;
      label?: string;
    };
    if (!definition || !pattern) return;
    try {
      await apiFetchVoid("/api/platform/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition, pattern, label: label?.trim() || undefined }),
      });
      setState(STATE.notice, `Scheduled ${definition} at ${pattern}.`);
      await loadSchedules(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Create failed");
    }
  }) satisfies CatalogActionHandler,

  deleteSchedule: (async (params, setState) => {
    const { id } = params as { id?: string };
    if (!id) return;
    if (!window.confirm("Remove this schedule? Its run history is kept.")) return;
    try {
      await apiFetchVoid(`/api/platform/schedules/${id}`, { method: "DELETE" });
      setState(STATE.notice, "Schedule removed; history kept.");
      await loadSchedules(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Delete failed");
    }
  }) satisfies CatalogActionHandler,
};