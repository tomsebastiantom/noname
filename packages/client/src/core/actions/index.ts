import { authActions } from "./auth";
import { contentActions } from "./content";
import { layoutActions } from "./layout";
import { navigationActions } from "./navigation";
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
} satisfies CatalogActionMap;

export type CoreActionName = keyof typeof coreActionHandlers;
