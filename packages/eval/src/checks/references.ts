import type { Check, CheckResult } from "../types";

/**
 * M1.references — every content-type `reference` field points at a type that exists.
 *
 * The write path already refuses a reference field with no target (`content-type-validation.ts`), but it does
 * not refuse a target that was never created: a content type can reference "category" while no `category`
 * content type exists, and the failure only appears when an editor tries to fill the field. This check turns
 * that into a release-time fact.
 *
 * It reads the content-type registry over the API (the documents domain's public surface), never the database.
 */

type FieldDefinition = {
  key?: string;
  type?: string;
  references?: string;
};

type ContentTypeRecord = {
  name?: string;
  schema?: { fields?: FieldDefinition[] };
};

type ContentTypesResponse = { data?: ContentTypeRecord[] };

const references: Check["run"] = async (ctx) => {
  const response = await ctx.client.getJson<ContentTypesResponse>("/api/documents/content-types");

  if (!response.ok) {
    return [
      {
        id: "M1.references",
        status: "skip",
        level: "error",
        detail: `could not read content types (${response.error}) — reference targets were not compared`,
      },
    ];
  }

  const types = response.data?.data ?? [];
  if (types.length === 0) {
    return [
      {
        id: "M1.references",
        status: "pass",
        level: "error",
        detail: "no content types declared — nothing to reference",
      },
    ];
  }

  const names = new Set(
    types.map((type) => type.name).filter((name): name is string => Boolean(name)),
  );
  const results: CheckResult[] = [];

  for (const type of types) {
    const name = type.name ?? "(unnamed)";
    const fields = type.schema?.fields ?? [];
    const referenceFields = fields.filter((field) => field.type === "reference");
    const problems: string[] = [];

    for (const field of referenceFields) {
      const target = field.references?.trim();
      if (!target) {
        problems.push(`field "${field.key}" is a reference but declares no target`);
        continue;
      }
      if (!names.has(target)) {
        problems.push(`field "${field.key}" references "${target}", which is not a content type`);
      }
    }

    results.push(
      problems.length === 0
        ? {
            id: "M1.references",
            status: "pass",
            level: "error",
            subject: name,
            detail:
              referenceFields.length === 0
                ? "no reference fields"
                : `${referenceFields.length} reference field(s) resolve`,
          }
        : {
            id: "M1.references",
            status: "fail",
            level: "error",
            subject: name,
            detail: problems.join("; "),
          },
    );
  }

  return results;
};

export const referenceChecks: Check[] = [
  {
    meta: {
      id: "M1.references",
      tier: 0,
      defaultLevel: "error",
      needs: ["api"],
      emits: ["M1.references"],
      description: "every content-type reference field points at an existing content type",
    },
    run: references,
  },
];
