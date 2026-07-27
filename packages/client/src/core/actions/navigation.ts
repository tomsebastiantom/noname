import { navigateApp } from "../../platform/app-navigation";
import type { CatalogActionHandler } from "./types";

export const navigationActions = {
  navigate: (async (params) => {
    const { path } = params as { path: string };
    navigateApp(path);
  }) satisfies CatalogActionHandler,
};
