import type { AgentTargetField } from "../hooks/editor-session";

export function buildAgentPromptPrefill(input: {
  templateName: string;
  componentType: string | null;
  agentTargetField: AgentTargetField | null;
}): string {
  const parts: string[] = [];
  if (input.templateName) {
    parts.push(`Page template: ${input.templateName}.`);
  }
  if (input.componentType) {
    parts.push(`Selected block: ${input.componentType}.`);
  }
  if (input.agentTargetField?.fieldType === "richText") {
    parts.push(`Focus field: ${input.agentTargetField.fieldLabel} (rich text).`);
    if (input.agentTargetField.excerpt) {
      parts.push(`Current excerpt: "${input.agentTargetField.excerpt}"`);
    }
  } else if (input.agentTargetField) {
    parts.push(`Focus field: ${input.agentTargetField.fieldLabel}.`);
  }
  if (parts.length === 0) return "";
  return `${parts.join(" ")}\n\n`;
}

export function buildAgentPromptPlaceholder(input: {
  defaultPlaceholder: string;
  templateName: string;
  componentType: string | null;
  richTextTarget: { fieldLabel: string } | null;
  agentLabel: string | null;
}): string {
  if (input.richTextTarget) {
    return `Ask ${input.agentLabel ?? "the agent"} to update ${input.richTextTarget.fieldLabel}…`;
  }
  if (input.componentType) {
    return `Ask ${input.agentLabel ?? "the agent"} to change the ${input.componentType} block…`;
  }
  if (input.templateName) {
    return `Ask ${input.agentLabel ?? "the agent"} to improve this ${input.templateName} page…`;
  }
  return input.defaultPlaceholder;
}
