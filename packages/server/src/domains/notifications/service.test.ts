import { describe, expect, it, vi } from "vitest";
import { agentTaskCompleteEmailSpec } from "../../../../../scripts/seed/email-specs";
import type { NotificationsStorage } from "./adapters/postgres";
import type { EmailOutboundJobData } from "./queue";
import { createNotificationsService } from "./service";

const mockContent = {
  findById: vi.fn(),
  findByType: vi.fn(),
  resolve: vi.fn(),
};

function buildService(storage: Partial<NotificationsStorage>) {
  const add = vi.fn(async () => ({ id: "job-1" }));
  const queue = { add } as unknown as { add: typeof add };

  return {
    service: createNotificationsService({
      secrets: {
        resolveCommsCredentials: vi.fn(async () => ({
          provider: "resend",
          apiKey: "re_test",
          fromEmail: "noreply@example.com",
        })),
      },
      storage: storage as NotificationsStorage,
      queue: queue as never,
      content: mockContent,
    }),
    add,
  };
}

describe("createNotificationsService", () => {
  it("enqueueEmail inserts delivery and adds BullMQ job", async () => {
    const insertDelivery = vi.fn(async (input) => ({
      ...input,
      createdAt: new Date(),
      sentAt: null,
      providerMessageId: null,
      error: null,
    }));

    const { service, add } = buildService({ insertDelivery });

    const result = await service.enqueueEmail("org-1", {
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
    });

    expect(insertDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        status: "queued",
        channel: "email",
        toAddress: "user@example.com",
      }),
    );
    expect(add).toHaveBeenCalledWith(
      "send",
      expect.objectContaining({
        orgId: "org-1",
        to: "user@example.com",
      } satisfies Partial<EmailOutboundJobData>),
    );
    expect(result.jobId).toBe("job-1");
  });

  it("enqueueTemplatedEmail renders json-render email spec and queues", async () => {
    mockContent.findById.mockReset();
    mockContent.findByType.mockReset();
    mockContent.resolve.mockReset();

    mockContent.findByType.mockResolvedValue([
      {
        id: "tpl-1",
        orgId: "org-1",
        type: "notification_email",
        key: "tpl-1",
        status: "published",
        data: { template_key: "agent-task-complete" },
      },
    ]);
    mockContent.resolve.mockResolvedValue({
      template_key: "agent-task-complete",
      subject: "Agent task complete",
      spec: agentTaskCompleteEmailSpec,
      category: "agent",
    });

    const insertDelivery = vi.fn(async (input) => ({
      ...input,
      createdAt: new Date(),
      sentAt: null,
      providerMessageId: null,
      error: null,
    }));
    const getPreferences = vi.fn(async () => ({
      orgId: "org-1",
      userId: "user-1",
      agentTaskEmail: true,
      marketingEmail: false,
      updatedAt: new Date(),
    }));

    const { service, add } = buildService({ insertDelivery, getPreferences });

    const result = await service.enqueueTemplatedEmail("org-1", {
      to: "user@example.com",
      templateId: "agent-task-complete",
      variables: { name: "Alex", taskName: "Summarize", summary: "Done." },
      userId: "user-1",
    });

    expect(add).toHaveBeenCalledWith(
      "send",
      expect.objectContaining({
        subject: "Agent task complete",
        html: expect.stringContaining("Alex"),
      }),
    );
    expect(result.skipped).toBeUndefined();
  });

  it("enqueueTemplatedEmail skips when agent preference is off", async () => {
    mockContent.findByType.mockResolvedValue([
      {
        id: "tpl-1",
        orgId: "org-1",
        type: "notification_email",
        key: "tpl-1",
        status: "published",
        data: { template_key: "agent-task-complete" },
      },
    ]);
    mockContent.resolve.mockResolvedValue({
      template_key: "agent-task-complete",
      subject: "Done",
      spec: agentTaskCompleteEmailSpec,
      category: "agent",
    });

    const insertDelivery = vi.fn();
    const getPreferences = vi.fn(async () => ({
      orgId: "org-1",
      userId: "user-1",
      agentTaskEmail: false,
      marketingEmail: false,
      updatedAt: new Date(),
    }));

    const { service, add } = buildService({ insertDelivery, getPreferences });

    const result = await service.enqueueTemplatedEmail("org-1", {
      to: "user@example.com",
      templateId: "agent-task-complete",
      userId: "user-1",
    });

    expect(result.skipped).toBe(true);
    expect(insertDelivery).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
