import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const catalog = defineCatalog(schema, {
  components: {
    Hero: {
      props: z.object({
        title: z.string(),
        subtitle: z.string().nullable(),
        image: z.string().nullable(),
        ctaLabel: z.string().nullable(),
        ctaAction: z.string().nullable(),
      }),
      description: "Full-width hero banner with title, image, and CTA",
    },
    ProductCard: {
      props: z.object({
        title: z.string(),
        price: z.number(),
        image: z.string().nullable(),
        description: z.string().nullable(),
      }),
      description: "Product card with image, title, price, and description",
    },
    Grid: {
      props: z.object({
        columns: z.number().min(1).max(6).default(3),
        gap: z.number().min(0).default(16),
      }),
      slots: ["default"],
      description: "CSS Grid container for layout",
    },
    Stack: {
      props: z.object({
        direction: z.enum(["row", "column"]).default("column"),
        gap: z.number().min(0).default(16),
        align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
      }),
      slots: ["default"],
      description: "Flexbox stack container",
    },
    Text: {
      props: z.object({
        value: z.string(),
        variant: z.enum(["h1", "h2", "h3", "body", "caption"]).default("body"),
        align: z.enum(["left", "center", "right"]).default("left"),
      }),
      description: "Text block with variant styles",
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(["primary", "secondary", "outline"]).default("primary"),
        action: z.string().nullable(),
      }),
      description: "Clickable button that dispatches an action",
    },
    Image: {
      props: z.object({
        src: z.string(),
        alt: z.string().default(""),
        fit: z.enum(["cover", "contain", "fill"]).default("cover"),
        width: z.number().nullable(),
        height: z.number().nullable(),
      }),
      description: "Responsive image with object-fit",
    },
  },
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
      params: z.object({
        path: z.string(),
      }),
      description: "Navigate to a page",
    },
  },
});
