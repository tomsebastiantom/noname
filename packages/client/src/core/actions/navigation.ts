import type { CatalogActionHandler } from "./types";

export const navigationActions = {
  navigate: (async (params) => {
    const { path } = params as { path: string };
    window.location.href = path;
  }) satisfies CatalogActionHandler,
};
