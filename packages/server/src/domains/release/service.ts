import { ConflictError, NotFoundError } from "../../shared/domain-error";
import type { CreateReleaseInput, ReleaseDTO, ReleaseService, ReleaseStore } from "./ports";
import { validateCreateRelease } from "./validation";

export function createReleaseService(store: ReleaseStore): ReleaseService {
  const get = async (orgId: string, id: string): Promise<ReleaseDTO> => {
    const release = await store.findById(orgId, id);
    if (!release) throw new NotFoundError("Release", id);
    return release;
  };

  return {
    async create(orgId, input: CreateReleaseInput, createdBy) {
      validateCreateRelease(input);
      return store.create(orgId, input, createdBy);
    },

    get,

    getAnyOrg: async (id) => {
      const release = await store.findByIdAnyOrg(id);
      if (!release) throw new NotFoundError("Release", id);
      return release;
    },

    list: (orgId) => store.list(orgId),

    /**
     * `building → ready`. Only a ready release may be promoted or pointed at; the transition is one-way
     * here, and retirement is a later operation. Calling it twice is a conflict, not a silent no-op.
     */
    async markReady(orgId, id) {
      const release = await get(orgId, id);
      if (release.state !== "building") {
        throw new ConflictError(`Release ${id} is already ${release.state}`, {
          id,
          state: release.state,
        });
      }
      return store.updateState(orgId, id, "ready");
    },
  };
}
