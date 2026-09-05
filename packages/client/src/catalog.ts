import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { componentSchemas } from "./component-schemas";

type CatalogComponentDef<D> = D extends { props: infer P }
  ? {
      props: P;
      description: string;
      slots?: string[];
    }
  : never;

type CatalogComponents = {
  [K in keyof typeof componentSchemas]: CatalogComponentDef<(typeof componentSchemas)[K]>;
};

function toCatalogDef(def: { props: z.ZodTypeAny; description: string; slots?: readonly string[] }) {
  return {
    props: def.props,
    // Some shadcn definitions omit `slots` — normalize instead of widening access.
    ...("slots" in def && def.slots ? { slots: [...def.slots] } : {}),
    description: def.description,
  };
}

export const catalog = defineCatalog(schema, {
  // Object.fromEntries erases literal keys (collapsing every component's props
  // into one union), so cast back to the per-key mapped type.
  components: Object.fromEntries(
    Object.entries(componentSchemas).map(([name, def]) => [
      name,
      toCatalogDef(
        def as { props: z.ZodTypeAny; description: string; slots?: readonly string[] },
      ),
    ]),
  ) as CatalogComponents,
  actions: {
    addToCart: {
      params: z.object({
        productId: z.string(),
        quantity: z.number().min(1).default(1),
      }),
      description: "Add product to cart",
    },
    checkout: {
      description: "Proceed to checkout",
    },
    navigate: {
      params: z.object({ path: z.string() }),
      description: "Navigate to a path",
    },
  },
});
