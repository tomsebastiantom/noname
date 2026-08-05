import { coerceScalarString } from "@noname/shared";

export interface TaskNotifyInput {
  to: string;
  userId?: string;
  templateId?: string;
  variables?: Record<string, string>;
}

export function parseTaskNotify(input: Record<string, unknown>): TaskNotifyInput | null {
  const notify = input.notify;
  if (!notify || typeof notify !== "object" || Array.isArray(notify)) {
    return null;
  }

  const record = notify as Record<string, unknown>;
  const to = coerceScalarString(record.to).trim();
  if (!to) return null;

  const userIdRaw = coerceScalarString(record.userId).trim();
  const templateIdRaw = coerceScalarString(record.templateId).trim();
  const variablesRaw = record.variables;

  let variables: Record<string, string> | undefined;
  if (variablesRaw && typeof variablesRaw === "object" && !Array.isArray(variablesRaw)) {
    variables = {};
    for (const [key, value] of Object.entries(variablesRaw as Record<string, unknown>)) {
      variables[key] = coerceScalarString(value);
    }
  }

  return {
    to,
    userId: userIdRaw || undefined,
    templateId: templateIdRaw || undefined,
    variables,
  };
}

export function summarizeTaskOutput(output: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(output);
    return text.length > 280 ? `${text.slice(0, 277)}…` : text;
  } catch {
    return "Task finished.";
  }
}

export function taskNotifyVariables(
  type: string,
  prompt: string,
  output: Record<string, unknown>,
  notify: TaskNotifyInput,
): Record<string, string> {
  return {
    taskName: type,
    name: notify.variables?.name ?? "there",
    summary: notify.variables?.summary ?? summarizeTaskOutput(output),
    prompt: notify.variables?.prompt ?? prompt.slice(0, 200),
    ...notify.variables,
  };
}
