import { authActions } from "./auth";
import { contentActions } from "./content";
import { flagActions } from "./flags";
import { layoutActions } from "./layout";
import { navigationActions } from "./navigation";
import { replayActions } from "./replay";
import { routingActions } from "./routing";
import { teamActions } from "./team";
import type { CatalogActionMap } from "./types";

export const coreActionHandlers = {
  ...navigationActions,
  ...authActions,
  ...contentActions,
  ...layoutActions,
  ...teamActions,
  ...routingActions,
  ...replayActions,
  ...flagActions,
} satisfies CatalogActionMap;

export type CoreActionName = keyof typeof coreActionHandlers;
