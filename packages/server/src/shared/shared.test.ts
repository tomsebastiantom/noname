import { describe, it, expect } from "vitest";

describe("shared", () => {
  it("event bus publishes and subscribes", async () => {
    const { eventBus } = await import("./event-bus");

    const received: unknown[] = [];
    eventBus.subscribe("test.event", async (data) => {
      received.push(data);
    });

    await eventBus.publish("test.event", { value: 42 });
    expect(received).toEqual([{ value: 42 }]);
  });

  it("AggregateRoot collects and flushes events", async () => {
    const { AggregateRoot, flushEvents } = await import("./aggregate-root");
    const { eventBus } = await import("./event-bus");

    class TestAggregate extends AggregateRoot {
      doSomething() {
        this.apply("test.done", { ok: true });
      }
    }

    const received: unknown[] = [];
    eventBus.subscribe("test.done", async (data) => {
      received.push(data);
    });

    const entity = new TestAggregate();
    entity.doSomething();
    flushEvents(entity);

    expect(received).toEqual([{ ok: true }]);
  });

  it("DomainError types", async () => {
    const { NotFoundError, ValidationError } = await import("./domain-error");

    const nf = new NotFoundError("User", "abc");
    expect(nf.message).toBe("User not found: abc");

    const ve = new ValidationError("email", "invalid");
    expect(ve.message).toBe("Validation failed for email: invalid");
  });
});
