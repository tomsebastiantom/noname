import { defineRegistry } from "@json-render/react";
import { catalog } from "./catalog";
import {
  Hero,
  ProductCard,
  Grid,
  Stack,
  Text as TextComponent,
  Button,
  Image,
} from "./components";

export const { registry, handlers, executeAction } = defineRegistry(catalog, {
  components: {
    Hero,
    ProductCard,
    Grid,
    Stack,
    Text: TextComponent,
    Button,
    Image,
  },
  actions: {
    addToCart: async (params, _setState, _state) => {
      const { productId, quantity } = params as { productId: string; quantity: number };
      await fetch("/api/machines/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
    },
    checkout: async (_params, _setState, _state) => {
      window.location.href = "/checkout";
    },
    navigate: async (params, _setState, _state) => {
      const { path } = params as { path: string };
      window.location.href = path;
    },
  },
});
