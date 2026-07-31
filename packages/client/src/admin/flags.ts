import { apiFetchData, apiFetchVoid } from "../lib/api";

export interface FlagRow {
  id: string;
  key: string;
  type: string;
  description: string;
  defaultValue: unknown;
  targeting: Array<{ priority: number; condition: unknown; value: unknown }>;
  status: string;
}

export async function listFlags(): Promise<FlagRow[]> {
  return apiFetchData<FlagRow[]>("/api/flags");
}

export async function setBooleanFlagValue(flagId: string, next: boolean): Promise<void> {
  await apiFetchVoid(`/api/flags/${flagId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      defaultValue: next,
      targeting: [{ priority: 0, condition: { type: "always" }, value: next }],
    }),
  });
}
