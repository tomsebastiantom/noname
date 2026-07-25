import type { ReactNode } from "react";

export interface ComponentCtx<P = Record<string, unknown>> {
  props: P;
  children?: ReactNode;
  emit: (event: string) => void;
}
