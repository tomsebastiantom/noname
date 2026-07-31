import type { AnalyticsService } from "../ports";
import type { ReplayBlobStorage } from "../replay-storage";

export interface AnalyticsRouteDeps {
  service: AnalyticsService;
  replayStorage: ReplayBlobStorage | null;
}
