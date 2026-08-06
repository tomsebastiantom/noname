import { CollabHumanIcon } from "../collab/CollabPeerIcons";

export function AgentUserMessage({
  content,
  selfLabel,
}: Readonly<{
  content: string;
  selfLabel: string;
}>) {
  return (
    <div className="editor-agent-chat-row editor-agent-chat-row--user">
      <div className="editor-agent-chat-content">
        <div className="editor-agent-chat-meta editor-agent-chat-meta--user">
          <span className="editor-agent-chat-name">{selfLabel}</span>
        </div>
        <div className="editor-agent-chat-bubble editor-agent-chat-bubble--user">
          <p className="editor-agent-message-text">{content}</p>
        </div>
      </div>
      <div className="editor-agent-chat-avatar editor-agent-chat-avatar--user" aria-hidden>
        <CollabHumanIcon className="editor-agent-chat-avatar-icon" />
      </div>
    </div>
  );
}
