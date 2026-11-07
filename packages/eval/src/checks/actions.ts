import { catalogHasAction } from "@noname/catalog";
import type { Check, CheckResult } from "../types";

/**
 * M2.actions — every action a published layout references is a declared platform action.
 *
 * This is the vocabulary half of the RFC's M2. The permission half (does the tenant hold the permission a
 * capability requires?) needs the capability registry and tenant roles; it is recorded as the remaining gap
 * rather than guessed here. An unknown action is unambiguous: the control renders and does nothing.
 */

type LayoutElement = { type?: unknown; props?: Record<string, unknown> };
type LayoutRecord = {
  key?: string;
  status?: string;
  data?: { spec?: { elements?: Record<string, LayoutElement> } };
};
type LayoutsResponse = { data?: LayoutRecord[] };

const actions: Check["run"] = async (ctx) => {
  const layouts = await ctx.client.getJson<LayoutsResponse>("/api/documents/layout");
  if (!layouts.ok) {
    return [
      {
        id: "M2.actions",
        status: "skip",
        level: "error",
        detail: `could not list layouts (${layouts.error}) — action references were not checked`,
      },
    ];
  }

  const published = (layouts.data?.data ?? []).filter((layout) => layout.status === "published");
  const results: CheckResult[] = [];
  let referenced = 0;

  for (const layout of published) {
    const elements = layout.data?.spec?.elements ?? {};
    const unknown: string[] = [];
    let perLayout = 0;

    for (const [key, element] of Object.entries(elements)) {
      const action = typeof element.props?.action === "string" ? element.props.action.trim() : "";
      if (!action) continue;
      perLayout += 1;
      referenced += 1;
      if (!catalogHasAction(action)) unknown.push(`${key}: "${action}"`);
    }

    if (perLayout === 0) continue;

    results.push(
      unknown.length === 0
        ? {
            id: "M2.actions",
            status: "pass",
            level: "error",
            subject: layout.key ?? "(unnamed layout)",
            detail: `${perLayout} action reference(s) declared`,
          }
        : {
            id: "M2.actions",
            status: "fail",
            level: "error",
            subject: layout.key ?? "(unnamed layout)",
            detail:
              `unknown action(s): ${unknown.slice(0, 3).join(", ")}` +
              (unknown.length > 3 ? ` (+${unknown.length - 3} more)` : ""),
          },
    );
  }

  if (referenced === 0) {
    results.push({
      id: "M2.actions",
      status: "pass",
      level: "error",
      detail: "no published layout references an action",
    });
  }

  return results;
};

export const actionChecks: Check[] = [
  {
    meta: {
      id: "M2.actions",
      tier: 0,
      defaultLevel: "error",
      needs: ["api"],
      emits: ["M2.actions"],
      description: "every action referenced by a published layout is a declared platform action",
    },
    run: actions,
  },
];
