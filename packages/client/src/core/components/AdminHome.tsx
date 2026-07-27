import type { ComponentCtx } from "./types";

export function AdminHome({
  props,
}: ComponentCtx<{
  title: string;
  description: string | null;
  links: { href: string; label: string; description: string }[];
}>) {
  return (
    <div className="max-w-2xl">
      {props.description ? (
        <p className="mb-6 text-sm text-muted-foreground">{props.description}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {props.links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40"
          >
            <p className="font-medium">{link.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
