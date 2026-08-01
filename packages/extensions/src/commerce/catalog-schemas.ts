import { z } from "zod";
import { catalogProps } from "../catalog-props";

export const commerceComponentSchemas = {
  Hero: {
    props: catalogProps(
      {
        title: z.string(),
        subtitle: z.string().nullable(),
        ctaText: z.string().nullable(),
        imageAlt: z.string().nullable(),
      },
      {
        image: z.string().nullable(),
        ctaAction: z.string().nullable(),
      },
    ),
    description: "Full-width hero banner with title, image, and CTA",
  },
  ProductCard: {
    props: catalogProps(
      {
        addToCart: z.string(),
        adding: z.string(),
        addedToCart: z.string(),
        addFailed: z.string(),
      },
      {
        productId: z.string(),
        title: z.string(),
        price: z.number(),
        image: z.string().nullable(),
        description: z.string().nullable(),
      },
    ),
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
