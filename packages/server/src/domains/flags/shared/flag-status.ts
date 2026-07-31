import type { FlagDTO, FlagStatus } from "../ports";

export function isActiveFlag(status: FlagStatus): boolean {
  return status === "active";
}

export function isActive(flag: Pick<FlagDTO, "status">): boolean {
  return isActiveFlag(flag.status);
}
