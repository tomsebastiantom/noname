import type { ReactNode } from "react";
import type { ComponentCtx } from "../../../core/components/types";

type AdminCollapsibleSectionConfig = {
  defaultOpen: boolean;
};

type AdminCollapsibleSectionLabels = {
  title: string;
  description: string | null;
};

export function AdminCollapsibleSection({
  props,
  children,
}: ComponentCtx<AdminCollapsibleSectionConfig & AdminCollapsibleSectionLabels>) {
  const labels = props;

  return (
    <details
      open={props.defaultOpen}
      className="group rounded-lg border bg-card text-card-foreground"
    >
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{labels.title}</h2>
            {labels.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{labels.description}</p>
            ) : null}
          </div>
          <span
            className="mt-0.5 text-xs text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          >
            ▾
          </span>
        </div>
      </summary>
      <div className="space-y-4 border-t px-4 py-4">{children as ReactNode}</div>
    </details>
  );
}
