import { NotFoundError } from "../../shared/domain-error";
import type { FlagDTO, FlagStorage } from "./ports";

export async function requireFlag(
  storage: FlagStorage,
  orgId: string,
  id: string,
): Promise<FlagDTO> {
  const flag = await storage.findById(orgId, id);
  if (!flag) throw new NotFoundError("FeatureFlag", id);
  return flag;
}
