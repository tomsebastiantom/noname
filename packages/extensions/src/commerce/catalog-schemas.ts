import { z } from "zod";

export const commerceComponentSchemas = {
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
};

export const commerceActionSchemas = {
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
};
