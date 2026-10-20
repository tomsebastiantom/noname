/**
 * Process lifecycle state, so the readiness endpoint can stop advertising this replica the moment
 * shutdown begins.
 *
 * Draining is deliberately process-wide module state rather than a parameter: `index.ts` owns the
 * signal handlers and `bootstrap.ts` owns the routes, and the route handler needs to observe a
 * transition that happens later. Threading a live flag through the domain-factory graph would mean
 * rebuilding the app on shutdown.
 *
 * Why it matters: without it a load balancer keeps routing to a replica that has already called
 * `server.close()`, so requests fail during a deploy window that a readiness gate would have avoided.
 */

let draining = false;

/** Called when SIGTERM/SIGINT starts the drain. Irreversible — there is no clean way back. */
export function beginDraining(): void {
  draining = true;
}

export function isDraining(): boolean {
  return draining;
}

/** Test-only: restore the pre-shutdown state between test files. */
export function resetLifecycleForTests(): void {
  draining = false;
  shutdownTasks.length = 0;
}

/**
 * Background work that must be *stopped* on shutdown, as opposed to the BullMQ workers that must be
 * *drained*. A relay or a debounced flusher holds in-flight work that would otherwise be abandoned when
 * the process exits.
 */
const shutdownTasks: { name: string; run: () => Promise<void> }[] = [];

export function registerShutdownTask(name: string, run: () => Promise<void>): void {
  shutdownTasks.push({ name, run });
}

/**
 * Runs every registered task, never throwing. One failing task must not strand the others, and shutdown
 * has to reach `process.exit` regardless.
 */
export async function runShutdownTasks(): Promise<void> {
  const tasks = shutdownTasks.splice(0);
  if (tasks.length === 0) return;
  const results = await Promise.allSettled(tasks.map((task) => task.run()));
  const failed = results
    .map((result, index) => ({ result, task: tasks[index] }))
    .filter(({ result }) => result.status === "rejected");
  for (const { result, task } of failed) {
    console.error(
      `[shutdown] task "${task?.name}" failed`,
      (result as PromiseRejectedResult).reason,
    );
  }
  if (failed.length > 0) {
    console.warn(`[shutdown] ${failed.length}/${tasks.length} shutdown task(s) failed`);
  }
}
