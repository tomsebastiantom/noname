import type { ReactNode } from "react";

/** json-render component context — shared by all extensions. */
export interface ComponentCtx<P = Record<string, unknown>> {
  props: P;
  children?: ReactNode;
  emit: (event: string) => void;
}
