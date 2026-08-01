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
      <div className="flex min-h-screen">
        <aside className="hidden w-1/2 flex-col justify-between bg-muted p-12 lg:flex">
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
        <main className="flex flex-1 items-center justify-center p-6">{children as ReactNode}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-6">
      {(labels.brandTitle || labels.brandSubtitle) && (
        <div className="mb-8 text-center">
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
  );
}
