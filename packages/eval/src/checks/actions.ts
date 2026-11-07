import { actionContract, actionContracts, catalogHasAction } from "@noname/catalog";
import type { Check, CheckResult } from "../types";

/**
 * M2 — every action a published layout references is declared, and every action that crosses into a
 * capability is wired to one that exists, belongs to an installed extension, and declares the permission the
 * contract expects.
 *
 * Two results are emitted separately:
 *  - `M2.actions` — vocabulary. Needs no credential and always runs.
 *  - `M2.permissions` — capability wiring. Needs the machine-only `/api/eval/context`; without it the check
 *    skips rather than guessing.
 *
 * Tenant-role evaluation (does this tenant’s staff hold the permission?) is still open: the context exposes
 * what the capability *declares*, not which roles the tenant has. That is recorded in the plan, not faked.
 */

type LayoutElement = { type?: unknown; props?: Record<string, unknown> };
type LayoutRecord = {
  key?: string;
  status?: string;
  data?: { spec?: { elements?: Record<string, LayoutElement> } };
};
type LayoutsResponse = { data?: LayoutRecord[] };

type CapabilityDescriptor = {
  name?: string;
  permission?: string | null;
  extension?: string | null;
  publicAccess?: string | null;
};
type EvalContextResponse = {
  data?: { capabilities?: CapabilityDescriptor[]; extensions?: string[] };
};

function actionOf(element: LayoutElement): string {
  return typeof element.props?.action === "string" ? element.props.action.trim() : "";
}

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

  const published = (layouts.data?.data ?? []).filter(
    (layout) =>
      layout.status === "published" || (ctx.includeDrafts === true && layout.status === "draft"),
  );
  const results: CheckResult[] = [];
  let referenced = 0;

  for (const layout of published) {
    const elements = layout.data?.spec?.elements ?? {};
    const unknown: string[] = [];
    let perLayout = 0;

    for (const [key, element] of Object.entries(elements)) {
      const action = actionOf(element);
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

  // ---- capability wiring -------------------------------------------------------------------------
  const context = await ctx.client.getJson<EvalContextResponse>("/api/eval/context");
  if (!context.ok) {
    results.push({
      id: "M2.permissions",
      status: "skip",
      level: "error",
      detail: `could not read eval context (${context.error}) — capability wiring was not checked`,
    });
    return results;
  }

  const capabilities = new Map(
    (context.data?.data?.capabilities ?? [])
      .filter((capability): capability is CapabilityDescriptor & { name: string } =>
        Boolean(capability.name),
      )
      .map((capability) => [capability.name, capability]),
  );
  const extensions = new Set(context.data?.data?.extensions ?? []);

  // Every declared contract is checked, not only the ones a layout happens to reference: a component can
  // invoke an action internally (the orders admin does), so “unused in a layout” is not “unused”.
  const contractProblems: string[] = [];
  for (const [action, contract] of Object.entries(actionContracts)) {
    const capability = capabilities.get(contract.capability);
    if (!capability) {
      contractProblems.push(`"${action}": capability "${contract.capability}" is not registered`);
      continue;
    }
    if (!extensions.has(contract.extension)) {
      contractProblems.push(`"${action}": extension "${contract.extension}" is not installed`);
    }
    if ((capability.permission ?? "") !== contract.permission) {
      contractProblems.push(
        `"${action}": capability "${contract.capability}" declares "${capability.permission ?? "none"}", contract expects "${contract.permission}"`,
      );
    }
  }

  results.push(
    contractProblems.length === 0
      ? {
          id: "M2.permissions",
          status: "pass",
          level: "error",
          subject: "contracts",
          detail: `${Object.keys(actionContracts).length} capability contract(s) wired`,
        }
      : {
          id: "M2.permissions",
          status: "fail",
          level: "error",
          subject: "contracts",
          detail:
            contractProblems.slice(0, 3).join("; ") +
            (contractProblems.length > 3 ? ` (+${contractProblems.length - 3} more)` : ""),
        },
  );

  for (const layout of published) {
    const elements = layout.data?.spec?.elements ?? {};
    const problems: string[] = [];
    let perLayout = 0;

    for (const [key, element] of Object.entries(elements)) {
      const action = actionOf(element);
      const contract = action ? actionContract(action) : null;
      if (!contract) continue;
      perLayout += 1;

      const capability = capabilities.get(contract.capability);
      if (!capability) {
        problems.push(
          `${key}: "${action}" needs capability "${contract.capability}" (not registered)`,
        );
        continue;
      }
      if (!extensions.has(contract.extension)) {
        problems.push(
          `${key}: "${action}" needs extension "${contract.extension}" (not installed)`,
        );
      }
      if ((capability.permission ?? "") !== contract.permission) {
        problems.push(
          `${key}: capability "${contract.capability}" declares "${capability.permission ?? "none"}", contract expects "${contract.permission}"`,
        );
      }
    }

    if (perLayout === 0) continue;

    results.push(
      problems.length === 0
        ? {
            id: "M2.permissions",
            status: "pass",
            level: "error",
            subject: layout.key ?? "(unnamed layout)",
            detail: `${perLayout} capability-backed action(s) wired`,
          }
        : {
            id: "M2.permissions",
            status: "fail",
            level: "error",
            subject: layout.key ?? "(unnamed layout)",
            detail:
              problems.slice(0, 3).join("; ") +
              (problems.length > 3 ? ` (+${problems.length - 3} more)` : ""),
          },
    );
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
      emits: ["M2.actions", "M2.permissions"],
      description:
        "every action referenced by a published layout is declared, and capability-backed actions are wired",
    },
    run: actions,
  },
];
