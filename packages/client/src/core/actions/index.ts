import { analyticsActions } from "./analytics";
import { authActions } from "./auth";
import { contentActions } from "./content";
import { flagActions } from "./flags";
import { layoutActions } from "./layout";
import { navigationActions } from "./navigation";
import { replayActions } from "./replay";
import { routingActions } from "./routing";
import { scopeActions } from "./scope";
import { teamActions } from "./team";
import type { CatalogActionMap } from "./types";

export const coreActionHandlers = {
  ...navigationActions,
  ...authActions,
  ...contentActions,
  ...layoutActions,
  ...teamActions,
  ...scopeActions,
  ...routingActions,
  ...replayActions,
  ...analyticsActions,
  ...flagActions,
} satisfies CatalogActionMap;

export type CoreActionName = keyof typeof coreActionHandlers;
