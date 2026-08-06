import { describe, expect, it } from "vitest";
import { buildOrchestrateUserPrompt, parseConversationHistory } from "./orchestrate-prompt";

describe("parseConversationHistory", () => {
  it("parses user and assistant turns", () => {
    expect(
      parseConversationHistory({
        conversationHistory: [
          { role: "user", content: "Change Summer Sale to Winter Sale" },
          { role: "assistant", content: "Should I update the home hero?" },
        ],
      }),
    ).toEqual([
      { role: "user", content: "Change Summer Sale to Winter Sale" },
      { role: "assistant", content: "Should I update the home hero?" },
    ]);
  });
});

describe("buildOrchestrateUserPrompt", () => {
  it("includes prior turns before the latest message", () => {
    const prompt = buildOrchestrateUserPrompt("yes", [
      { role: "user", content: "Edit summer sale to winter sale" },
      { role: "assistant", content: "Update the home hero Text block?" },
    ]);
    expect(prompt).toContain("Previous conversation");
    expect(prompt).toContain("Latest message:\nyes");
    expect(prompt).toContain("Update the home hero Text block?");
  });
});
