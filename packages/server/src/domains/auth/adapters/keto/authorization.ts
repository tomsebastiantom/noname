import type {
  AuthNamespace,
  AuthorizationCheckInput,
  AuthorizationPort,
  RelationTuple,
  RelationTupleFilter,
  TupleSubjectType,
} from "../../authorization-port";

function parseListedTuple(raw: Record<string, unknown>): RelationTuple | null {
  const namespace = raw.namespace;
  const objectId = raw.object;
  const relation = raw.relation;
  if (
    typeof namespace !== "string" ||
    typeof objectId !== "string" ||
    typeof relation !== "string"
  ) {
    return null;
  }

  const subjectSet = raw.subject_set;
  if (subjectSet && typeof subjectSet === "object" && !Array.isArray(subjectSet)) {
    const set = subjectSet as Record<string, unknown>;
    const setNs = set.namespace;
    const setObject = set.object;
    const setRelation = set.relation;
    if (typeof setNs === "string" && typeof setObject === "string") {
      return {
        namespace: namespace as AuthNamespace,
        objectId,
        relation,
        subject: {
          type: setNs as TupleSubjectType,
          id: setObject,
          relation: typeof setRelation === "string" ? setRelation : undefined,
        },
      };
    }
  }

  const subjectId = raw.subject_id;
  if (typeof subjectId === "string") {
    const colon = subjectId.indexOf(":");
    if (colon <= 0) return null;
    const type = subjectId.slice(0, colon);
    const id = subjectId.slice(colon + 1);
    if ((type === "User" || type === "Agent") && id) {
      return {
        namespace: namespace as AuthNamespace,
        objectId,
        relation,
        subject: { type, id },
      };
    }
  }

  return null;
}

function listQuery(filter: RelationTupleFilter): URLSearchParams {
  const params = new URLSearchParams({ namespace: filter.namespace });
  if (filter.objectId) params.set("object", filter.objectId);
  if (filter.relation) params.set("relation", filter.relation);
  if (filter.subjectSet) {
    params.set("subject_set.namespace", filter.subjectSet.namespace);
    params.set("subject_set.object", filter.subjectSet.object);
    params.set("subject_set.relation", filter.subjectSet.relation);
  }
  return params;
}

function subjectId(subject: { type: string; id: string }): string {
  return `${subject.type}:${subject.id}`;
}

/** Tag → Team bindings use subject_set with Team#editors|publishers. */
function tuplePayload(tuple: RelationTuple): Record<string, unknown> {
  const base = {
    namespace: tuple.namespace,
    object: tuple.objectId,
    relation: tuple.relation,
  };
  if (tuple.subject.type === "Team") {
    return {
      ...base,
      subject_set: {
        namespace: "Team",
        object: tuple.subject.id,
        relation: tuple.subject.relation ?? "",
      },
    };
  }
  return {
    ...base,
    subject_id: subjectId(tuple.subject),
  };
}

function revokeQuery(tuple: RelationTuple): URLSearchParams {
  const payload = tuplePayload(tuple);
  const params = new URLSearchParams({
    namespace: String(payload.namespace),
    object: String(payload.object),
    relation: String(payload.relation),
  });
  if (payload.subject_set) {
    const set = payload.subject_set as { namespace: string; object: string; relation: string };
    params.set("subject_set.namespace", set.namespace);
    params.set("subject_set.object", set.object);
    params.set("subject_set.relation", set.relation);
  } else if ("subject_id" in payload) {
    params.set("subject_id", String(payload.subject_id));
  }
  return params;
}

async function listDirectUsers(
  fetchFn: typeof fetch,
  readUrl: string,
  namespace: string,
  objectId: string,
  relation: string,
): Promise<{ type: "User"; id: string }[]> {
  const params = new URLSearchParams({
    namespace,
    object: objectId,
    relation,
  });
  const res = await fetchFn(`${readUrl}/relation-tuples?${params}`);
  if (!res.ok) {
    throw new Error(`Keto list failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    relation_tuples?: { subject_id?: string; subject_set?: unknown }[];
  };
  const out: { type: "User"; id: string }[] = [];
  for (const tuple of body.relation_tuples ?? []) {
    if (tuple.subject_set) continue;
    const sid = tuple.subject_id;
    if (!sid?.startsWith("User:")) continue;
    const id = sid.slice("User:".length);
    if (id) out.push({ type: "User", id });
  }
  return out;
}

export function createKetoAuthorizationAdapter(deps: {
  readUrl: string;
  writeUrl: string;
  fetchImpl?: typeof fetch;
}): AuthorizationPort {
  const fetchFn = deps.fetchImpl ?? fetch;

  return {
    async check(input: AuthorizationCheckInput): Promise<boolean> {
      const res = await fetchFn(`${deps.readUrl}/relation-tuples/check/openapi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespace: input.namespace,
          object: input.objectId,
          relation: input.permission,
          subject_id: subjectId(input.subject),
        }),
      });
      if (!res.ok) {
        throw new Error(`Keto check failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as { allowed?: boolean };
      return body.allowed === true;
    },

    async grant(tuple: RelationTuple): Promise<void> {
      const res = await fetchFn(`${deps.writeUrl}/admin/relation-tuples`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tuplePayload(tuple)),
      });
      if (!res.ok) {
        throw new Error(`Keto grant failed: ${res.status} ${await res.text()}`);
      }
    },

    async revoke(tuple: RelationTuple): Promise<void> {
      const params = revokeQuery(tuple);
      const res = await fetchFn(`${deps.writeUrl}/admin/relation-tuples?${params}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error(`Keto revoke failed: ${res.status} ${await res.text()}`);
      }
    },

    async listDirectUserEditors(namespace, objectId): Promise<{ type: "User"; id: string }[]> {
      return listDirectUsers(fetchFn, deps.readUrl, namespace, objectId, "editors");
    },

    async listDirectUserPublishers(namespace, objectId): Promise<{ type: "User"; id: string }[]> {
      return listDirectUsers(fetchFn, deps.readUrl, namespace, objectId, "publishers");
    },

    async listRelationTuples(filter: RelationTupleFilter): Promise<RelationTuple[]> {
      const params = listQuery(filter);
      const res = await fetchFn(`${deps.readUrl}/relation-tuples?${params}`);
      if (!res.ok) {
        throw new Error(`Keto list failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as { relation_tuples?: Record<string, unknown>[] };
      const out: RelationTuple[] = [];
      for (const raw of body.relation_tuples ?? []) {
        const tuple = parseListedTuple(raw);
        if (tuple) out.push(tuple);
      }
      return out;
    },
  };
}
