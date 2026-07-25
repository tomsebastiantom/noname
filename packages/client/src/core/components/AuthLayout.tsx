import type { ComponentCtx } from "./types";

export function AuthLayout({
  props,
  children,
}: ComponentCtx<{
  layout: "centered" | "split";
  brandTitle: string | null;
  brandSubtitle: string | null;
}>) {
  if (props.layout === "split") {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] flex-1">
        <aside className="hidden w-1/2 flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
          <div>
            {props.brandTitle && (
              <p className="text-lg font-semibold tracking-tight">{props.brandTitle}</p>
            )}
          </div>
          <div>
            {props.brandTitle && (
              <h1 className="text-3xl font-bold tracking-tight">{props.brandTitle}</h1>
            )}
            {props.brandSubtitle && (
              <p className="mt-3 max-w-md text-sm text-primary-foreground/80">
                {props.brandSubtitle}
              </p>
            )}
          </div>
        </aside>
        <div className="flex flex-1 items-center justify-center p-6">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      {(props.brandTitle || props.brandSubtitle) && (
        <div className="mb-8 max-w-md text-center">
          {props.brandTitle && (
            <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {props.brandTitle}
            </p>
          )}
          {props.brandSubtitle && (
            <p className="mt-2 text-sm text-muted-foreground">{props.brandSubtitle}</p>
          )}
        </div>
      )}
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
