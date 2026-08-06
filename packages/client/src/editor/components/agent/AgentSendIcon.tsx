export function AgentSendIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Send</title>
      <path d="M8 12V4" />
      <path d="M5.5 6.5 8 4l2.5 2.5" />
    </svg>
  );
}
