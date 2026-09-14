import { describe, expect, it } from "vitest";
import { createSeedContext, runSeedProfile } from "./index";

describe("seed profile runner", () => {
  it("runs dependencies before dependent steps once", async () => {
    const calls: string[] = [];
    const context = createSeedContext({
      profile: "full",
      runId: "test-run",
      dryRun: false,
      now: new Date("2026-09-14T00:00:00.000Z"),
    });
    const result = await runSeedProfile({
      profile: "full",
      context,
      steps: [
        {
          id: "commerce",
          dependsOn: ["platform"],
          run: async () => {
            calls.push("commerce");
          },
        },
        {
          id: "platform",
          run: async () => {
            calls.push("platform");
          },
        },
      ],
    });
    expect(calls).toEqual(["platform", "commerce"]);
    expect(result.steps.map((step) => step.id)).toEqual(["platform", "commerce"]);
  });

  it("rejects missing dependencies", async () => {
    const context = createSeedContext({
      profile: "platform",
      runId: "test-run",
      dryRun: false,
      now: new Date(),
    });
    await expect(
      runSeedProfile({
        profile: "platform",
        context,
        steps: [{ id: "platform", dependsOn: ["missing"], run: async () => {} }],
      }),
    ).rejects.toThrow('Seed step "missing" is not registered');
  });

  it("rejects dependency cycles", async () => {
    const context = createSeedContext({
      profile: "full",
      runId: "test-run",
      dryRun: false,
      now: new Date(),
    });
    await expect(
      runSeedProfile({
        profile: "full",
        context,
        steps: [
          { id: "a", dependsOn: ["b"], run: async () => {} },
          { id: "b", dependsOn: ["a"], run: async () => {} },
        ],
      }),
    ).rejects.toThrow('Seed dependency cycle detected at "a"');
  });
});
