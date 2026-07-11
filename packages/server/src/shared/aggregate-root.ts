import { eventBus } from "./event-bus";

export type DomainEvent = { name: string; data: unknown; timestamp: Date };

export abstract class AggregateRoot {
  private readonly events: DomainEvent[] = [];

  protected apply(name: string, data: unknown): void {
    this.events.push({ name, data, timestamp: new Date() });
  }

  commit(): DomainEvent[] {
    const committed = [...this.events];
    this.events.length = 0;
    return committed;
  }
}

export function flushEvents(entity: AggregateRoot): void {
  for (const event of entity.commit()) {
    void eventBus.publish(event.name, event.data);
  }
}
