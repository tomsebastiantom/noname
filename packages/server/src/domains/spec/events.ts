import { eventBus } from "../../shared/event-bus";
export const specEvents = {
  templatePublished: (spec: unknown) => eventBus.publish("spec.published", spec),
  templateVariantCreated: (variant: unknown) => eventBus.publish("spec.variant_created", variant),
};
