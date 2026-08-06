/** Lightweight formatting for assistant replies (lists, line breaks). */
export function AgentMessageText({ text }: Readonly<{ text: string }>) {
  const blocks = text.split(/\n{2,}/).filter((block) => block.trim());

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="editor-agent-message-body">
      {blocks.map((block) => {
        const lines = block.split("\n").filter((line) => line.trim());
        const isNumbered =
          lines.length > 1 && lines.every((line) => /^\d+[.)]\s/.test(line.trim()));
        const isBulleted = lines.length > 1 && lines.every((line) => /^[-*•]\s/.test(line.trim()));

        if (isNumbered) {
          return (
            <ol key={block.slice(0, 24)} className="editor-agent-message-list">
              {lines.map((line) => (
                <li key={line}>{line.replace(/^\d+[.)]\s*/, "")}</li>
              ))}
            </ol>
          );
        }

        if (isBulleted) {
          return (
            <ul key={block.slice(0, 24)} className="editor-agent-message-list">
              {lines.map((line) => (
                <li key={line}>{line.replace(/^[-*•]\s*/, "")}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={block.slice(0, 24)} className="editor-agent-message-text">
            {block}
          </p>
        );
      })}
    </div>
  );
}
