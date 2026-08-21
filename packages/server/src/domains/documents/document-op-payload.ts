import { diffToPatches, type Spec } from "@json-render/core";
import { ValidationError } from "../../shared/domain-error";

/** RFC 6902 operation stored in `document_ops.payload`. */
export type JsonPatchOp = {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
};

export type DocumentOpPayload =
  | {
      opType: "patch_spec";
      patch: JsonPatchOp[];
      baseUpdatedAt?: string;
    }
  | {
      opType: "patch_data";
      patch: JsonPatchOp[];
      baseUpdatedAt?: string;
    }
  | {
      opType: "lifecycle";
      action: "publish" | "archive" | "delete";
    };

export function buildSpecPatchPayload(
  previousSpec: Record<string, unknown> | undefined,
  nextSpec: Record<string, unknown>,
  baseUpdatedAt?: string,
): DocumentOpPayload {
  const patch = diffToPatches(previousSpec ?? {}, nextSpec) as JsonPatchOp[];
  return {
    opType: "patch_spec",
    patch,
    ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
  };
}

export function buildDataPatchPayload(
  previousData: Record<string, unknown> | undefined,
  nextData: Record<string, unknown>,
  baseUpdatedAt?: string,
): DocumentOpPayload {
  const patch = diffToPatches(previousData ?? {}, nextData) as JsonPatchOp[];
  return {
    opType: "patch_data",
    patch,
    ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
  };
}

export function buildLayoutDataPatchPayload(
  previousData: Record<string, unknown>,
  nextData: Record<string, unknown>,
  baseUpdatedAt?: string,
): DocumentOpPayload {
  return buildDataPatchPayload(previousData, nextData, baseUpdatedAt);
}

/** Apply RFC 6902 patches in order (replay / tests). */
export function applyJsonPatch<T>(document: T, patch: JsonPatchOp[]): T {
  const result = structuredClone(document) as Record<string, unknown>;
  for (const op of patch) {
    applyOne(result, op);
  }
  return result as T;
}

export function replaySpecPatches(
  baseSpec: Record<string, unknown>,
  payloads: Array<Pick<DocumentOpPayload, "opType"> & { patch?: JsonPatchOp[] }>,
): Record<string, unknown> {
  let spec = structuredClone(baseSpec);
  for (const payload of payloads) {
    if (payload.opType !== "patch_spec" && payload.opType !== "patch_data") continue;
    if (!payload.patch?.length) continue;
    spec = applyJsonPatch(spec, payload.patch);
  }
  return spec;
}

function applyOne(doc: Record<string, unknown>, op: JsonPatchOp): void {
  switch (op.op) {
    case "add":
      setAtPointer(doc, op.path, op.value, false);
      break;
    case "replace":
      setAtPointer(doc, op.path, op.value, true);
      break;
    case "remove":
      removeAtPointer(doc, op.path);
      break;
    default:
      throw new ValidationError("op", `Unsupported JSON Patch op: ${op.op}`);
  }
}

function decodePointer(path: string): string[] {
  if (!path.startsWith("/")) {
    throw new ValidationError("path", `Invalid JSON Pointer: ${path}`);
  }
  if (path === "/") return [""];
  return path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function getParent(
  doc: Record<string, unknown>,
  tokens: string[],
): { parent: Record<string, unknown> | unknown[]; key: string } {
  if (tokens.length === 0) {
    throw new ValidationError("path", "Cannot resolve empty pointer");
  }
  let current: unknown = doc;
  for (let i = 0; i < tokens.length - 1; i++) {
    current = readToken(current, tokens[i]!);
  }
  const key = tokens[tokens.length - 1]!;
  if (Array.isArray(current)) {
    return { parent: current, key };
  }
  if (current && typeof current === "object") {
    return { parent: current as Record<string, unknown>, key };
  }
  throw new ValidationError("path", `Invalid pointer parent at ${tokens.join("/")}`);
}

function readToken(current: unknown, token: string): unknown {
  if (Array.isArray(current)) {
    const index = token === "-" ? current.length : Number(token);
    if (!Number.isInteger(index) || index < 0 || index >= current.length) {
      throw new ValidationError("path", `Array index out of bounds: ${token}`);
    }
    return current[index];
  }
  if (current && typeof current === "object") {
    const record = current as Record<string, unknown>;
    if (!(token in record)) {
      throw new ValidationError("path", `Missing key: ${token}`);
    }
    return record[token];
  }
  throw new ValidationError("path", `Cannot traverse into ${typeof current}`);
}

function setAtPointer(
  doc: Record<string, unknown>,
  path: string,
  value: unknown,
  mustExist: boolean,
): void {
  const tokens = decodePointer(path);
  if (tokens.length === 1 && tokens[0] === "") {
    throw new ValidationError("op", "Root replace is not supported");
  }
  const { parent, key } = getParent(doc, tokens);
  if (Array.isArray(parent)) {
    const index = key === "-" ? parent.length : Number(key);
    if (key !== "-" && (!Number.isInteger(index) || index < 0)) {
      throw new ValidationError("path", `Invalid array index: ${key}`);
    }
    if (mustExist && (key === "-" || index >= parent.length)) {
      throw new ValidationError("path", `Array index does not exist: ${key}`);
    }
    if (key === "-") {
      parent.push(value);
    } else {
      parent[index] = value;
    }
    return;
  }
  const record = parent as Record<string, unknown>;
  if (mustExist && !(key in record)) {
    throw new ValidationError("path", `Key does not exist: ${key}`);
  }
  record[key] = value;
}

function removeAtPointer(doc: Record<string, unknown>, path: string): void {
  const tokens = decodePointer(path);
  const { parent, key } = getParent(doc, tokens);
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
      throw new ValidationError("path", `Invalid array index: ${key}`);
    }
    parent.splice(index, 1);
    return;
  }
  const record = parent as Record<string, unknown>;
  if (!(key in record)) {
    throw new ValidationError("path", `Key does not exist: ${key}`);
  }
  delete record[key];
}

/** Type guard for layout spec replay helpers in tests. */
export function isSpecLike(value: unknown): value is Spec {
  return !!value && typeof value === "object" && "elements" in (value as object);
}
