import { describe, expect, it } from "vitest";
import { parseTaskNotify, taskNotifyVariables } from "./task-notify";

describe("task-notify", () => {
  it("parseTaskNotify requires notify.to", () => {
    expect(parseTaskNotify({ notify: { to: "a@b.com", userId: "u1" } })).toEqual({
      to: "a@b.com",
      userId: "u1",
      templateId: undefined,
      variables: undefined,
    });
    expect(parseTaskNotify({ notify: {} })).toBeNull();
  });

  it("taskNotifyVariables merges defaults", () => {
    expect(
      taskNotifyVariables(
        "generate_layout",
        "hero prompt",
        { ok: true },
        { to: "a@b.com", variables: { name: "Alex" } },
      ),
    ).toMatchObject({
      name: "Alex",
      taskName: "generate_layout",
      prompt: "hero prompt",
    });
  });
});
