import { actionChecks } from "./checks/actions";
import { browserChecks } from "./checks/browser";
import { manifestChecks } from "./checks/manifest";
import { reachabilityChecks } from "./checks/reachability";
import { referenceChecks } from "./checks/references";
import { routeChecks } from "./checks/routes";
import type { Check } from "./types";

/**
 * The single catalogue.
 *
 * Every check is registered here once. The integrity check below is intentionally run at import
 * time: a duplicate id, an emitted id that collides with another check, or a malformed id is a
 * programming error that must fail fast rather than produce ambiguous results that a dashboard
 * silently averages.
 */
export const CHECK_REGISTRY: readonly Check[] = [
  ...actionChecks,
  ...manifestChecks,
  ...reachabilityChecks,
  ...referenceChecks,
  ...routeChecks,
  ...browserChecks,
];

const ID_PATTERN = /^[A-Z]\d+\.[a-z][a-z0-9_]*$/;

export function assertRegistryIntegrity(registry: readonly Check[]): void {
  const declared = new Set<string>();
  const emitted = new Map<string, string>();

  for (const check of registry) {
    const { id, emits, tier, defaultLevel } = check.meta;

    if (!ID_PATTERN.test(id)) {
      throw new Error(`eval registry: check id "${id}" does not match <family><tier>.<name>`);
    }
    if (tier !== 0 && tier !== 1 && tier !== 2) {
      throw new Error(`eval registry: check "${id}" has invalid tier ${tier}`);
    }
    if (defaultLevel !== "warn" && defaultLevel !== "error") {
      throw new Error(`eval registry: check "${id}" has invalid default level "${defaultLevel}"`);
    }
    if (declared.has(id)) {
      throw new Error(`eval registry: duplicate check id "${id}"`);
    }
    declared.add(id);

    if (emits.length === 0) {
      throw new Error(`eval registry: check "${id}" declares no emitted result ids`);
    }
    for (const resultId of emits) {
      if (!ID_PATTERN.test(resultId)) {
        throw new Error(
          `eval registry: emitted id "${resultId}" does not match <family><tier>.<name>`,
        );
      }
      const owner = emitted.get(resultId);
      if (owner) {
        throw new Error(
          `eval registry: result id "${resultId}" is emitted by both "${owner}" and "${id}"`,
        );
      }
      emitted.set(resultId, id);
    }
  }
}

assertRegistryIntegrity(CHECK_REGISTRY);
