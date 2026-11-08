import { AsyncLocalStorage } from "node:async_hooks";

type RequestContextStore = { requestId: string };

const storage = new AsyncLocalStorage<RequestContextStore>();

/** Run a request inside its request-id scope so services can attach it to audit rows without signature churn. */
export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** The current request id, or undefined in jobs/scripts and unit tests. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
