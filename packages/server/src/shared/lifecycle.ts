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
}
