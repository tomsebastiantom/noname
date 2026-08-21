import { createBindingOps } from "./bindings";
import { createCollectionOps } from "./collections";
import type { ScopeDeps } from "./deps";
import { createDocumentAccessOps } from "./document-access";
import type { CollectionAgentBinding, CollectionTeamBinding, TeamMemberEntry } from "./helpers";
import { createTeamOps } from "./teams";

export function createScopeService(deps: ScopeDeps) {
  return {
    ...createCollectionOps(deps),
    ...createTeamOps(deps),
    ...createBindingOps(deps),
    ...createDocumentAccessOps(deps),
  };
}

export type { CollectionAgentBinding, CollectionTeamBinding, TeamMemberEntry };

export type ScopeService = ReturnType<typeof createScopeService>;
