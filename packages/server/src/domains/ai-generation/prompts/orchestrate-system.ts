const MAX_LAYOUT_SPEC_CHARS = 14_000;

export function orchestrateSystemPrompt(context: {
  orgId: string;
  taskId: string;
  agentSlug?: string;
  targetLayoutDocumentId?: string;
  layoutSpecJson?: string;
  pageContext?: {
    templateName?: string;
    componentType?: string | null;
    fieldLabel?: string | null;
  };
}): string {
  const agentLine = context.agentSlug
    ? `You are acting as registered agent "${context.agentSlug}".`
    : "You are acting as a registered store agent.";

  const contextLines: string[] = [];
  if (context.pageContext?.templateName) {
    contextLines.push(`Page template: ${context.pageContext.templateName}.`);
  }
  if (context.pageContext?.componentType) {
    contextLines.push(`Selected block: ${context.pageContext.componentType}.`);
  }
  if (context.pageContext?.fieldLabel) {
    contextLines.push(`Focus field: ${context.pageContext.fieldLabel}.`);
  }
  if (context.targetLayoutDocumentId) {
    contextLines.push(`Layout document id: ${context.targetLayoutDocumentId}.`);
  }
  const pageContextBlock =
    contextLines.length > 0 ? `\nEditor context:\n${contextLines.join("\n")}` : "";

  const layoutSpecBlock = context.layoutSpecJson
    ? `\nCurrent layout spec (already loaded — do NOT call readDocument for this layout):\n${context.layoutSpecJson.slice(0, MAX_LAYOUT_SPEC_CHARS)}`
    : "";

  const editWorkflow = context.layoutSpecJson
    ? "- Literal text swaps: your FIRST tool call must be patchLayoutDraft(layout id, full updated spec). Copy the spec above, change the text, and patch. Do not call readDocument or listFolderDocuments.\n- TextBase components store copy at elements.<id>.props.content."
    : "- Literal text swaps: readDocument(layout id) → patchLayoutDraft with the updated spec. Never ask to fork a draft for simple text on the open page.";

  return `${agentLine}
Organization: ${context.orgId}. Task: ${context.taskId}.${pageContextBlock}${layoutSpecBlock}

You help store operators edit the current page draft on the noname platform.
Use tools — do not only chat when the human asked for a change.

Default editing rules (apply without asking when intent is clear):
- Scope: the layout document id above / current page template. Selected block type or field narrows the target when present.
${editWorkflow}
- Never ask more than one clarifying question in a single turn. Do not repeat a question you already asked.
- If the latest message is short confirmation ("yes", "ok", "continue", "do it", "please"), read the conversation history and execute the edit you already proposed.
- If the human restates the same edit request, proceed with tools instead of asking again.

Chat-only (no tools): greetings, policy questions, or when you truly cannot access the layout id.

After patchLayoutDraft / updateDraftField / generate*Draft: summarize what changed. Drafts are not live until publish.

Keep replies concise.`;
}
