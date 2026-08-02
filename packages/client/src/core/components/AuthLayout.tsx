import type { ReactNode } from "react";
import type { CatalogProps } from "../../schemas/shared";
import type { ComponentCtx } from "./types";

type AuthLayoutConfig = {
  layout: "centered" | "split";
};

type AuthLayoutLabels = {
  brandTitle: string | null;
  brandSubtitle: string | null;
};

export function AuthLayout({
  props,
  children,
}: ComponentCtx<CatalogProps<AuthLayoutConfig, AuthLayoutLabels>>) {
  const { config, labels } = props;

  if (config.layout === "split") {
    return (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-1/2 flex-col justify-between overflow-y-auto bg-muted p-8 lg:flex lg:p-12">
          <div>
            {labels.brandTitle && (
              <p className="text-lg font-semibold tracking-tight">{labels.brandTitle}</p>
            )}
          </div>
          <div>
            {labels.brandTitle && (
              <h1 className="text-3xl font-bold tracking-tight">{labels.brandTitle}</h1>
            )}
            {labels.brandSubtitle && (
              <p className="mt-2 text-muted-foreground">{labels.brandSubtitle}</p>
            )}
          </div>
        </aside>
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4 sm:p-6">
          <div className="my-auto w-full max-w-md">{children as ReactNode}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-muted/30 p-4 sm:p-6">
      <div className="my-auto flex w-full flex-col items-center">
        {(labels.brandTitle || labels.brandSubtitle) && (
          <div className="mb-6 max-w-md text-center sm:mb-8">
            {labels.brandTitle && (
              <h1 className="text-2xl font-bold tracking-tight">{labels.brandTitle}</h1>
            )}
            {labels.brandSubtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{labels.brandSubtitle}</p>
            )}
          </div>
        )}
        <div className="w-full max-w-md">{children as ReactNode}</div>
      </div>
    </div>
  );
}
