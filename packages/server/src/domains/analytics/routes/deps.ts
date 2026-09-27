import type {
  AudienceExperiencePerformanceBinding,
  AudienceExperiencePerformanceFilters,
} from "../../audiences/ports";
import type { AnalyticsService } from "../ports";
import type { ReplayBlobStorage } from "../replay-storage";

export interface AnalyticsRouteDeps {
  service: AnalyticsService;
  replayStorage: ReplayBlobStorage | null;
  getAudiencePerformance(
    filters: AudienceExperiencePerformanceFilters,
  ): Promise<AudienceExperiencePerformanceBinding[]>;
}
