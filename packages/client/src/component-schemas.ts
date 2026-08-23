import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

const baseComponentSchemas = {
  Hero: {
    props: z.object({
      title: z.string(),
      subtitle: z.string().nullable(),
      image: z.string().nullable(),
      ctaLabel: z.string().nullable(),
      ctaAction: z.string().nullable(),
    }),
    slots: [],
    description: "Full-width hero banner with title, image, and CTA",
  },
  ProductCard: {
    props: z.object({
      title: z.string(),
      price: z.number(),
      image: z.string().nullable(),
      description: z.string().nullable(),
    }),
    slots: [],
    description: "Product card with image, title, price, and description",
  },
  GridBase: {
    props: z.object({
      columns: z.number().min(1).max(6).default(3),
      gap: z.number().min(0).default(16),
    }),
    slots: ["default"],
    description: "CSS Grid container for layout",
  },
  StackBase: {
    props: z.object({
      direction: z.enum(["row", "column"]).default("column"),
      gap: z.number().min(0).default(16),
      align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
    }),
    slots: ["default"],
    description: "Flexbox stack container",
  },
  TextBase: {
    props: z.object({
      content: z.string(),
      variant: z.enum(["h1", "h2", "h3", "body", "caption"]).default("body"),
      align: z.enum(["left", "center", "right"]).default("left"),
    }),
    slots: [],
    description: "Text block with variant styles",
  },
  ButtonBase: {
    props: z.object({
      label: z.string(),
      variant: z.enum(["primary", "secondary", "outline"]).default("primary"),
      action: z.string().nullable(),
    }),
    slots: [],
    description: "Clickable button that dispatches an action",
  },
  ImageBase: {
    props: z.object({
      src: z.string(),
      alt: z.string().default(""),
      fit: z.enum(["cover", "contain", "fill"]).default("cover"),
      width: z.number().nullable(),
      height: z.number().nullable(),
    }),
    slots: [],
    description: "Responsive image with object-fit",
  },
};

export const componentSchemas = {
  // Our base schemas are canonical — spread after shadcn so they win name conflicts.
  ...shadcnComponentDefinitions,
  ...baseComponentSchemas,
};
