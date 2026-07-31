import { describe, expect, it, vi } from "vitest";

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
    const { ConflictError, NotFoundError, UnauthorizedError, ValidationError } = await import(
      "./domain-error"
    );

    const nf = new NotFoundError("User", "abc");
    expect(nf.message).toBe("User not found: abc");
    expect(nf.httpStatus).toBe(404);

    const ve = new ValidationError("email", "invalid");
    expect(ve.message).toBe("Validation failed for email: invalid");
    expect(ve.httpStatus).toBe(400);

    const ue = new UnauthorizedError("bad credentials");
    expect(ue.httpStatus).toBe(401);

    const ce = new ConflictError("duplicate");
    expect(ce.httpStatus).toBe(409);
  });

  it("handleDomainError maps DomainError to httpStatus", async () => {
    const { handleDomainError } = await import("./error-handler");
    const { UnauthorizedError, ValidationError } = await import("./domain-error");
    const json = vi.fn((_body: unknown, status: number) => new Response(null, { status }));
    const c = { json } as unknown as import("hono").Context;

    handleDomainError(new ValidationError("hero", "missing ref"), c);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "VALIDATION_ERROR" }), 400);

    json.mockClear();
    handleDomainError(new UnauthorizedError("nope"), c);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "UNAUTHORIZED" }), 401);
  });
});
