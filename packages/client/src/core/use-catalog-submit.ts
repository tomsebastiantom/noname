import { useActions } from "@json-render/react";
import { useCallback, useState } from "react";
import type { CoreActionName } from "./actions";

export function formatCatalogError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type CatalogSubmitOptions = {
  action: CoreActionName;
  params?: Record<string, unknown>;
  successMessage?: string;
  onSuccess?: () => void | Promise<void>;
  onPendingChange?: (pending: boolean) => void;
};

export type CatalogRunOptions = {
  successMessage?: string;
  onSuccess?: () => void | Promise<void>;
  onPendingChange?: (pending: boolean) => void;
};

export function useCatalogSubmit() {
  const { execute } = useActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const clearSuccess = useCallback(() => setSuccess(null), []);
  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  const executeAction = useCallback(
    async (action: CoreActionName, params?: Record<string, unknown>) => {
      await execute(params ? { action, params } : { action });
    },
    [execute],
  );

  const run = useCallback(async (work: () => Promise<void>, options?: CatalogRunOptions) => {
    const setPendingState = options?.onPendingChange ?? setPending;
    setPendingState(true);
    setError(null);
    setSuccess(null);
    try {
      await work();
      if (options?.successMessage) setSuccess(options.successMessage);
      await options?.onSuccess?.();
    } catch (err) {
      setError(formatCatalogError(err));
    } finally {
      setPendingState(false);
    }
  }, []);

  const submit = useCallback(
    async (options: CatalogSubmitOptions) => {
      await run(
        async () => {
          await execute(
            options.params
              ? { action: options.action, params: options.params }
              : { action: options.action },
          );
        },
        {
          successMessage: options.successMessage,
          onSuccess: options.onSuccess,
          onPendingChange: options.onPendingChange,
        },
      );
    },
    [execute, run],
  );

  return {
    submit,
    run,
    executeAction,
    pending,
    error,
    success,
    setError,
    setSuccess,
    clearError,
    clearSuccess,
    reset,
  };
}

export type CatalogSubmit = ReturnType<typeof useCatalogSubmit>;

/** Merge local submit errors with json-render load errors for display. */
export function mergeCatalogError(
  submitError: string | null,
  loadError: string | null | undefined,
): string | null {
  return submitError ?? loadError ?? null;
}
