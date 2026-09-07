import type { TenantSettingsService } from "../../documents/ports";
import type { MachineEngine } from "../ports";

export interface MachineRouteDeps {
  engine: MachineEngine;
  tenantSettings: Pick<TenantSettingsService, "get">;
}
