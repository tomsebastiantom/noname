import type { Database } from "../../drizzle";
import type { EvidenceService } from "../evidence/ports";
import { createScheduleRoutes } from "./api";
import { type ScheduleHandler, SCHEDULE_DEFINITIONS } from "./definitions";
import { createScheduleService } from "./service";
import { registerSchedules, startScheduleWorker } from "./worker";

export { SCHEDULE_DEFINITIONS } from "./definitions";
export type { ScheduleView, ScheduleRun } from "./service";
export { failStaleRuns } from "./service";


/**
 * The schedules domain: definitions in code, state in the database, execution on the existing queue.
 *
 * Handlers are injected rather than imported so this domain does not depend on the tenant or release domains — the
 * domain that owns the behaviour owns the handler, and this one only knows "run it, record it".
 */
export function createSchedulesDomain(deps: {
  db: Database;
  evidence: EvidenceService;
  handlers: Record<string, ScheduleHandler>;
}) {
  const service = createScheduleService({
    db: deps.db,
    handlers: deps.handlers,
    onMissingHandler: (name, reason) => {
      console.error(`[schedules] ${name} is defined but unavailable: ${reason}`);
    },
  });

  return {
    service,
    routes: createScheduleRoutes(service),
    /** Called once at startup, after the service exists. */
    start: async () => {
      await registerSchedules(service);
      startScheduleWorker(service);
    },
    definitions: SCHEDULE_DEFINITIONS,
  };
}
