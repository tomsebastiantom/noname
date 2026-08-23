import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import { componentSchemas } from "./component-schemas";

export const catalog = defineCatalog(schema, {
  components: Object.fromEntries(
    Object.entries(componentSchemas).map(([name, def]) => [
      name,
      {
        props: def.props,
        ...(def.slots ? { slots: def.slots } : {}),
        description: def.description,
      },
    ]),
  ),
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
