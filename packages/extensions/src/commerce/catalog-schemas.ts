import { z } from "zod";

export const commerceComponentSchemas = {
  CartSummary: {
    props: z.object({
      title: z.string(),
      checkoutLabel: z.string(),
      viewCartLabel: z.string(),
      hideCartLabel: z.string(),
      loadingLabel: z.string(),
      itemLabel: z.string(),
      itemsLabel: z.string(),
      priceUnavailableLabel: z.string(),
      signInLabel: z.string(),
      signInRequiredLabel: z.string(),
      paymentPendingLabel: z.string(),
      paymentSuccessLabel: z.string(),
      paymentFailedLabel: z.string(),
    }),
  },
  Hero: {
    props: z.object({
      title: z.string(),
      subtitle: z.string().nullable(),
      ctaText: z.string().nullable(),
      imageAlt: z.string().nullable(),
      image: z.string().nullable(),
      ctaAction: z.string().nullable(),
    }),
    description: "Full-width hero banner with title, image, and CTA",
  },
  ProductCard: {
    props: z.object({
      addToCart: z.string(),
      adding: z.string(),
      addedToCart: z.string(),
      addFailed: z.string(),
      productId: z.string(),
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
    description: "Create a hosted checkout session and redirect",
  },
  mergeGuestCart: {
    description: "Claim the guest cart for the signed-in user (also runs on login)",
  },
};
