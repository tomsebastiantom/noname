import "dotenv/config";
import { createSeedContext, runSeedProfile } from "./index";
import { runCommerceSeed } from "./profiles/commerce/index";
import { runPlatformSeed } from "./profiles/platform/index";

const profile = process.argv[2] ?? "platform";
const apiBase = process.env.API_BASE ?? "http://localhost:3000";
const storeSlug = "yogastore";

const steps =
  profile === "platform"
    ? [{ id: "platform", run: runPlatformSeed }]
    : profile === "commerce"
      ? [{ id: "commerce", run: runCommerceSeed }]
      : profile === "full"
        ? [
            { id: "platform", run: runPlatformSeed },
            { id: "commerce", dependsOn: ["platform"], run: runCommerceSeed },
          ]
        : null;

if (!steps) {
  console.error(`Unknown seed profile "${profile}". Use platform, commerce, or full.`);
  process.exit(2);
}

runSeedProfile({
  profile,
  steps,
  context: createSeedContext({
    profile,
    runId: `${profile}-${Date.now()}`,
    dryRun: false,
    now: new Date(),
    apiBase,
    storeSlug,
  }),
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
