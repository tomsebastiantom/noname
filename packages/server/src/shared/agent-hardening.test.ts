import { describe, expect, it } from "vitest";
import {
  recordAgentKeyRotation,
  recordAgentTokenRateLimited,
  recordAgentUserInfo,
  renderMetrics,
  resetMetricsForTests,
} from "./metrics";

describe("agent hardening metrics", () => {
  it("exposes userinfo cache, rate-limit and key-rotation instruments", async () => {
    resetMetricsForTests();
    recordAgentUserInfo("hit", 0.001);
    recordAgentUserInfo("miss", 0.02);
    recordAgentTokenRateLimited();
    recordAgentKeyRotation();

    const text = await renderMetrics();

    expect(text).toContain('noname_agent_userinfo_cache_total{result="hit"} 1');
    expect(text).toContain('noname_agent_userinfo_cache_total{result="miss"} 1');
    expect(text).toContain("noname_agent_userinfo_duration_seconds_sum");
    expect(text).toContain("noname_agent_token_rate_limited_total 1");
    expect(text).toContain("noname_agent_key_rotations_total 1");
  });
});
