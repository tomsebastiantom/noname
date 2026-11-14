import { useActions, useStateValue } from "@json-render/react";
import { useEffect, useRef, useState } from "react";
import { ADMIN_STATE } from "../../../core/admin-state";
import type { ComponentCtx } from "../../../core/components/types";

/**
 * Schedules panel — scheduled work the platform can do, and when it does it.
 *
 * A catalog component: it renders `$state` written by action handlers and never calls `fetch` itself
 * (spec-driven-ui checklist). The definitions listed in the create form come from the server, which reads them from
 * `definitions.ts` — so the picker can only ever offer behaviour that exists in code.
 */
type ScheduleView = {
  id: string;
  definition: string;
  label: string | null;
  description: string;
  pattern: string;
  paused: boolean;
  dryRun: boolean;
  available: boolean;
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    status: string;
    items: number | null;
    dryRun: boolean;
    error: string | null;
  } | null;
};

type Definition = { name: string; description: string; defaultPattern: string };

export type SchedulesAdminProps = {
  title?: string;
  description?: string | null;
};

export function SchedulesAdmin({ props }: Readonly<ComponentCtx<SchedulesAdminProps>>) {
  const { execute } = useActions();
  const data = useStateValue(ADMIN_STATE.schedules.list) as
    | { schedules?: ScheduleView[]; definitions?: Definition[] }
    | null;
  const loading = useStateValue(ADMIN_STATE.schedules.loading) as boolean | null;
  const error = useStateValue(ADMIN_STATE.schedules.error) as string | null;
  const notice = useStateValue(ADMIN_STATE.schedules.notice) as string | null;

  const [definition, setDefinition] = useState("");
  const [pattern, setPattern] = useState("");
  const [label, setLabel] = useState("");

  const executeRef = useRef(execute);
  executeRef.current = execute;
  useEffect(() => {
    void executeRef.current({ action: "loadSchedules" });
  }, []);

  const run = (action: string, params?: Record<string, unknown>) =>
    void executeRef.current({ action, ...(params ? { params } : {}) });

  const schedules = data?.schedules ?? [];
  const definitions = data?.definitions ?? [];

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold">{props.title ?? "Schedules"}</h1>
        <p className="text-sm text-muted-foreground">
          {props.description ??
            "Scheduled work the platform can do. The list of things that can be scheduled is defined in code; a schedule only chooses when."}
        </p>
      </header>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!definition || !pattern) return;
          run("createSchedule", {
            definition,
            pattern,
            ...(label.trim() ? { label: label.trim() } : {}),
          });
          setPattern("");
          setLabel("");
        }}
      >
        <label className="text-sm">
          <span className="block text-muted-foreground">Definition</span>
          <select
            className="rounded border border-border px-2 py-1"
            value={definition}
            onChange={(event) => {
              setDefinition(event.target.value);
              const chosen = definitions.find((item) => item.name === event.target.value);
              if (chosen && !pattern) setPattern(chosen.defaultPattern);
            }}
          >
            <option value="">Choose…</option>
            {definitions.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Cron (5 fields)</span>
          <input
            className="rounded border border-border px-2 py-1"
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="0 3 * * *"
          />
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Label (optional)</span>
          <input
            className="rounded border border-border px-2 py-1"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="weekly deep sweep"
          />
        </label>
        <button type="submit" className="rounded border border-border px-3 py-1 text-sm">
          Create
        </button>
        <button type="button" className="text-sm underline" onClick={() => run("loadSchedules")}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </form>

      {definition ? (
        <p className="text-xs text-muted-foreground">
          {definitions.find((item) => item.name === definition)?.description}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Pick a definition to see what it does. A new capability is a code change, not a form entry.
        </p>
      )}

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {data === null ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {data && schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No schedules yet.</p>
      ) : null}

      {schedules.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1">Definition</th>
              <th className="py-1">Pattern</th>
              <th className="py-1">State</th>
              <th className="py-1">Last run</th>
              <th className="py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => (
              <tr key={schedule.id} className="border-t border-border align-top">
                <td className="py-1">
                  <span className="font-medium">{schedule.definition}</span>
                  {schedule.label ? (
                    <span className="ml-2 text-xs text-muted-foreground">{schedule.label}</span>
                  ) : null}
                  {!schedule.available ? (
                    <span className="ml-2 text-xs text-destructive">no handler</span>
                  ) : null}
                </td>
                <td className="py-1">
                  <input
                    className="w-28 rounded border border-border px-1 py-0.5 text-xs"
                    defaultValue={schedule.pattern}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== schedule.pattern) {
                        run("setSchedulePattern", { id: schedule.id, pattern: next });
                      }
                    }}
                  />
                </td>
                <td className="py-1 text-xs">
                  {schedule.paused ? "paused" : "active"}
                  {schedule.dryRun ? " · dry-run" : ""}
                </td>
                <td className="py-1 text-xs text-muted-foreground">
                  {schedule.lastRun
                    ? `${schedule.lastRun.status} · ${schedule.lastRun.items ?? 0} item(s) · ${schedule.lastRun.dryRun ? "dry" : "live"}`
                    : "never"}
                </td>
                <td className="py-1">
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => run("runSchedule", { id: schedule.id })}
                  >
                    Run now
                  </button>
                  <button
                    type="button"
                    className="ml-2 text-xs underline"
                    onClick={() =>
                      run("pauseSchedule", { id: schedule.id, paused: !schedule.paused })
                    }
                  >
                    {schedule.paused ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    className="ml-2 text-xs underline"
                    onClick={() => run("setScheduleDryRun", { id: schedule.id, dryRun: !schedule.dryRun })}
                  >
                    {schedule.dryRun ? "Go live" : "Dry run"}
                  </button>
                  <button
                    type="button"
                    className="ml-2 text-xs underline"
                    onClick={() => run("deleteSchedule", { id: schedule.id })}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
