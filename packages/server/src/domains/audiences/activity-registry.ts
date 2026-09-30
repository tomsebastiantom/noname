import type {
  ActivityTypeRegistry,
  DomainActivity,
  RegisteredActivityType,
} from "./activity-rules";

export function createActivityTypeRegistry(): ActivityTypeRegistry {
  const registrations = new Map<string, RegisteredActivityType>();
  const key = (type: string, version: number) => `${type}@${version}`;
  return {
    register(definition) {
      if (
        !/^[a-z][a-z0-9_.-]{1,127}$/.test(definition.type) ||
        !Number.isSafeInteger(definition.version) ||
        definition.version < 1
      )
        throw new Error("Invalid activity registration");
      const id = key(definition.type, definition.version);
      if (registrations.has(id)) throw new Error(`Activity type already registered: ${id}`);
      for (const [field, metadata] of Object.entries(definition.fields)) {
        if (
          !field.split(".").every((part) => /^[a-z][a-zA-Z0-9_]*$/.test(part)) ||
          !["string", "number", "boolean", "date"].includes(metadata.type) ||
          metadata.operators.length === 0
        )
          throw new Error(`Invalid registered activity field: ${field}`);
      }
      registrations.set(id, {
        ...definition,
        fields: Object.fromEntries(
          Object.entries(definition.fields).map(([field, metadata]) => [
            field,
            { type: metadata.type, operators: [...metadata.operators] },
          ]),
        ),
      });
    },
    get(type, version) {
      return registrations.get(key(type, version));
    },
    list() {
      return [...registrations.values()].map(({ validateFacts: _validate, ...metadata }) => ({
        ...metadata,
        fields: Object.fromEntries(
          Object.entries(metadata.fields).map(([field, value]) => [
            field,
            { type: value.type, operators: [...value.operators] },
          ]),
        ),
      }));
    },
    validate(activity: DomainActivity) {
      const definition = registrations.get(key(activity.type, activity.version));
      if (!definition)
        throw new Error(`Unregistered activity type/version: ${activity.type}@${activity.version}`);
      if (
        !activity.orgId ||
        !activity.activityId ||
        !activity.occurredAt ||
        Number.isNaN(activity.occurredAt.getTime())
      )
        throw new Error("Invalid activity envelope");
      if (
        activity.subjectUserId !== undefined &&
        activity.subjectUserId !== null &&
        typeof activity.subjectUserId !== "string"
      )
        throw new Error("Invalid activity subject");
      if (
        !activity.facts ||
        typeof activity.facts !== "object" ||
        Array.isArray(activity.facts) ||
        !definition.validateFacts(activity.facts)
      )
        throw new Error("Invalid activity facts");
      for (const [field, value] of flattenFacts(activity.facts)) {
        const metadata = definition.fields[field];
        if (!metadata || !validFieldValue(metadata.type, value))
          throw new Error(`Unregistered or invalid activity fact: ${field}`);
      }
    },
  };
}

function flattenFacts(value: Record<string, unknown>, prefix = ""): Array<[string, unknown]> {
  const result: Array<[string, unknown]> = [];
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const nested = flattenFacts(item as Record<string, unknown>, path);
      if (nested.length === 0) throw new Error(`Empty activity facts object: ${path}`);
      result.push(...nested);
    } else {
      result.push([path, item]);
    }
  }
  return result;
}
function validFieldValue(
  type: RegisteredActivityType["fields"][string]["type"],
  value: unknown,
): boolean {
  if (type === "date") return typeof value === "string" && !Number.isNaN(Date.parse(value));
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  return typeof value === "string";
}
