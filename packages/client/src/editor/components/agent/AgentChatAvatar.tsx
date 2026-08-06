/** Warm assistant mark for the chat panel — separate from collab peer icons. */
export function AgentChatSparkleIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={className}
      fill="currentColor"
    >
      <title>Assistant</title>
      <path
        d="M10 1.75l1.05 3.45 3.45 1.05-3.45 1.05L10 10.75 8.95 7.3 5.5 6.25l3.45-1.05L10 1.75z"
        opacity="0.95"
      />
      <circle cx="15.25" cy="4.75" r="1.05" opacity="0.72" />
      <circle cx="4.75" cy="13.75" r="0.8" opacity="0.55" />
      <path
        d="M14.5 12.25l0.55 1.65 1.65 0.55-1.65 0.55-0.55 1.65-0.55-1.65-1.65-0.55 1.65-0.55 0.55-1.65z"
        opacity="0.65"
      />
    </svg>
  );
}

export function AgentChatAvatar({
  running = false,
  size = "chat",
}: Readonly<{
  running?: boolean;
  size?: "chat" | "welcome";
}>) {
  return (
    <div
      className={`editor-agent-chat-avatar editor-agent-chat-avatar--assistant${
        size === "welcome" ? " editor-agent-chat-avatar--welcome" : ""
      }`}
      aria-hidden
    >
      <AgentChatSparkleIcon className="editor-agent-chat-avatar-sparkle" />
      {running ? <span className="editor-agent-chat-avatar-glow" aria-hidden /> : null}
    </div>
  );
}
