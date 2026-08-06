export function CollabHumanIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Person</title>
      <circle cx="8" cy="5" r="2.25" />
      <path d="M3.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
    </svg>
  );
}

export function CollabAgentIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Agent</title>
      <path d="M8 1.5l1 2.5 2.5.5-1.75 1.75.5 2.75L8 7.75 5.75 8.5l.5-2.75L4.5 4.5 7 4z" />
      <rect x="4" y="9.5" width="8" height="5" rx="1.25" />
      <path d="M6 12h4" />
    </svg>
  );
}
