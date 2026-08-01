import { useActions } from "@json-render/react";
import { useEffect, useRef } from "react";
import type { CoreActionName } from "../actions";
import type { ComponentCtx } from "./types";

/**
 * Run a catalog action on mount (or when action/params change).
 * Never pass `execute` as a useEffect dependency — json-render recreates it
 * when loadingActions updates and that loops.
 *
 * Pass stable `params` (e.g. `useMemo` when derived inline) to avoid refetch churn.
 */
export function useMountAction(
  action: CoreActionName,
  params?: Record<string, unknown> | null,
): void {
  const { execute } = useActions();
  const executeRef = useRef(execute);
  executeRef.current = execute;

  useEffect(() => {
    void executeRef.current(params ? { action, params } : { action });
  }, [action, params]);
}

/**
 * Layout-spec hook for initial data loads.
 *
 * json-render has no built-in mount trigger — `watch` only fires on state
 * *changes*. See skills/spec-driven-ui/SKILL.md.
 */
export function MountAction({
  props,
}: ComponentCtx<{
  config: {
    action: string;
    params?: Record<string, unknown> | null;
  };
  labels: Record<string, never>;
}>) {
  useMountAction(props.config.action as CoreActionName, props.config.params);
  return null;
}
