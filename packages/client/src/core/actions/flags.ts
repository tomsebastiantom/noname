import { listFlags, setBooleanFlagValue } from "../../admin/flags";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

async function refreshFlags(setState: (path: string, value: unknown) => void): Promise<void> {
  setState(ADMIN_STATE.flags.flags, await listFlags());
}

export const flagActions = {
  listFlags: (async (_params, setState) => {
    setState(ADMIN_STATE.flags.loading, true);
    setState(ADMIN_STATE.flags.error, null);
    try {
      await refreshFlags(setState);
    } catch (err) {
      setState(ADMIN_STATE.flags.error, err instanceof Error ? err.message : String(err));
      setState(ADMIN_STATE.flags.flags, []);
    } finally {
      setState(ADMIN_STATE.flags.loading, false);
    }
  }) satisfies CatalogActionHandler,

  toggleBooleanFlag: (async (params, setState) => {
    const { flagId, value } = params as { flagId: string; value: boolean };
    setState(ADMIN_STATE.flags.error, null);
    try {
      await setBooleanFlagValue(flagId, value);
      await refreshFlags(setState);
    } catch (err) {
      setState(ADMIN_STATE.flags.error, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }) satisfies CatalogActionHandler,
};
