import { isPlatformRole } from "@noname/auth";
import { type ActionContract, actionContracts } from "@noname/catalog";

/**
 * Contract validation for the audience model.
 *
 * Runs at import time: an action without an audience, or with a role that does not exist, must fail the build
 * rather than become a runtime skip. A skipped check must mean “data unavailable”, never “contract forgot to
 * declare who it is for”.
 */
export function validateActionContracts(contracts: Record<string, ActionContract>): void {
  const problems: string[] = [];

  for (const [action, contract] of Object.entries(contracts)) {
    if (!Array.isArray(contract.audience) || contract.audience.length === 0) {
      problems.push(`"${action}": audience is required`);
      continue;
    }

    const seen = new Set<string>();
    for (const role of contract.audience) {
      if (!isPlatformRole(role)) {
        problems.push(`"${action}": unknown audience role "${role}"`);
        continue;
      }
      if (seen.has(role)) problems.push(`"${action}": duplicate audience role "${role}"`);
      seen.add(role);
    }
  }

  if (problems.length > 0) {
    throw new Error(`invalid action contracts: ${problems.join("; ")}`);
  }
}

validateActionContracts(actionContracts);
