import { describe, expect, it, vi } from "vitest";
import type { NotificationsStorage } from "./adapters/postgres";
import type { EmailOutboundJobData } from "./queue";
import { createNotificationsService } from "./service";

describe("createNotificationsService", () => {
  it("enqueueEmail inserts delivery and adds BullMQ job", async () => {
    const insertDelivery = vi.fn(async (input) => ({
      ...input,
      createdAt: new Date(),
      sentAt: null,
      providerMessageId: null,
      error: null,
    }));
    const add = vi.fn(async () => ({ id: "job-1" }));
    const queue = { add } as unknown as { add: typeof add };

    const service = createNotificationsService({
      secrets: {
        resolveCommsCredentials: vi.fn(async () => ({
          provider: "resend",
          apiKey: "re_test",
          fromEmail: "noreply@example.com",
        })),
      },
      storage: { insertDelivery } as unknown as NotificationsStorage,
      queue: queue as never,
    });

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
});
