import { plainTextToRichTextDocument, serializeRichTextFieldValue } from "@noname/documents";
import { describe, expect, it } from "vitest";
import { agentTaskCompleteEmailSpec } from "../../../../../scripts/seed/email-specs";
import { parseNotificationEmailEntry, renderNotificationEmail } from "./email-template";

describe("notification email template", () => {
  it("parseNotificationEmailEntry requires template_key, subject, and spec", () => {
    expect(
      parseNotificationEmailEntry({
        template_key: "agent-task-complete",
        subject: "Done",
        spec: agentTaskCompleteEmailSpec,
        category: "operational",
      }),
    ).toMatchObject({
      templateKey: "agent-task-complete",
      subject: "Done",
      category: "operational",
    });

    expect(
      parseNotificationEmailEntry({
        template_key: "agent-task-complete",
        subject: "Done",
        spec: agentTaskCompleteEmailSpec,
        category: "agent",
      }),
    ).toMatchObject({
      category: "operational",
    });

    expect(
      parseNotificationEmailEntry({ template_key: "bad key", subject: "x", spec: {} }),
    ).toBeNull();
  });

  it("renderNotificationEmail uses json-render react-email with $state", async () => {
    const parsed = parseNotificationEmailEntry({
      template_key: "agent-task-complete",
      subject: "Agent task complete",
      spec: agentTaskCompleteEmailSpec,
      category: "operational",
    });
    expect(parsed).not.toBeNull();

    const rendered = await renderNotificationEmail(parsed!, {
      name: "Alex",
      taskName: "Summarize inbox",
      summary: "Done.",
    });

    expect(rendered.subject).toBe("Agent task complete");
    expect(rendered.html).toContain("Alex");
    expect(rendered.html).toContain("Summarize inbox");
    expect(rendered.html).toContain("Done.");
  });

  it("enriches rich text variables with _html and _text suffixes", async () => {
    const parsed = parseNotificationEmailEntry({
      template_key: "agent-task-complete",
      subject: "Rich body",
      spec: {
        root: "body",
        elements: {
          body: {
            type: "Text",
            props: { text: { $state: "/body_html" } },
          },
        },
      },
      category: "operational",
    });
    expect(parsed).not.toBeNull();

    const body = serializeRichTextFieldValue(
      plainTextToRichTextDocument("Hello **world**".replace("**world**", "world")),
    );
    const rendered = await renderNotificationEmail(parsed!, { body });
    expect(rendered.html).toContain("Hello world");
    expect(rendered.text).toContain("Hello world");
  });
});
