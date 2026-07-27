export type CatalogSetState = (path: string, value: unknown) => void;

export type CatalogActionHandler = (
  params: unknown,
  setState: CatalogSetState,
  state: Record<string, unknown>,
) => Promise<void>;

export type CatalogActionMap = Record<string, CatalogActionHandler>;
