import { describe, expect, it, vi } from "vitest";
import { agentTaskCompleteEmailSpec } from "../../../../../scripts/seed/email-specs";
import type { NotificationsStorage } from "./adapters/postgres";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./preferences";
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

  const defaults: Partial<NotificationsStorage> = {
    findDeliveryByIdempotency: vi.fn(async () => null),
    listDeliveries: vi.fn(async () => []),
    listDeliveryEventsForDeliveries: vi.fn(async () => []),
    findDeliveryByProviderMessageId: vi.fn(async () => null),
    insertDeliveryEvent: vi.fn(async (input) => ({
      row: { ...input, createdAt: new Date() },
      duplicate: false,
    })),
    findDelivery: vi.fn(async () => null),
    getPreferences: vi.fn(async () => ({
      orgId: "org-1",
      userId: "user-1",
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      updatedAt: new Date(),
    })),
    upsertPreferences: vi.fn(),
    updateDelivery: vi.fn(),
    insertInboxItem: vi.fn(async (input) => ({
      ...input,
      readAt: null,
      createdAt: new Date(),
    })),
    listInboxItems: vi.fn(async () => []),
    markInboxRead: vi.fn(async () => null),
  };

  return {
    service: createNotificationsService({
      secrets: {
        resolveCommsCredentials: vi.fn(async () => ({
          provider: "resend" as const,
          apiKey: "re_test",
          fromEmail: "noreply@example.com",
        })),
      },
      storage: { ...defaults, ...storage } as NotificationsStorage,
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
      attemptCount: 0,
      bodyHtml: input.bodyHtml ?? null,
      bodyText: input.bodyText ?? null,
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
      undefined,
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
      category: "operational",
    });

    const insertDelivery = vi.fn(async (input) => ({
      ...input,
      createdAt: new Date(),
      sentAt: null,
      providerMessageId: null,
      error: null,
      attemptCount: 0,
      bodyHtml: input.bodyHtml ?? null,
      bodyText: input.bodyText ?? null,
    }));

    const { service, add } = buildService({ insertDelivery });

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
      undefined,
    );
    expect(result.skipped).toBeUndefined();
  });

  it("enqueueTemplatedEmail skips when operational preference is off", async () => {
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
      category: "operational",
    });

    const insertDelivery = vi.fn();
    const getPreferences = vi.fn(async () => ({
      orgId: "org-1",
      userId: "user-1",
      preferences: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        categories: { marketing: false, operational: false },
      },
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

  it("enqueueEmail returns duplicate when idempotency key exists", async () => {
    const findDeliveryByIdempotency = vi.fn(async () => ({
      id: "existing-1",
      orgId: "org-1",
      userId: null,
      channel: "email",
      provider: "resend",
      toAddress: "user@example.com",
      subject: "Hello",
      status: "sent",
      providerMessageId: "msg-1",
      error: null,
      trigger: null,
      templateId: null,
      idempotencyKey: "key-1",
      attemptCount: 1,
      bodyHtml: null,
      bodyText: null,
      createdAt: new Date(),
      sentAt: new Date(),
    }));
    const insertDelivery = vi.fn();

    const { service, add } = buildService({ findDeliveryByIdempotency, insertDelivery });

    const result = await service.enqueueEmail("org-1", {
      to: "user@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      idempotencyKey: "key-1",
    });

    expect(result.duplicate).toBe(true);
    expect(result.deliveryId).toBe("existing-1");
    expect(insertDelivery).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("notify resolves trigger to template id", async () => {
    mockContent.findByType.mockResolvedValue([
      {
        id: "tpl-1",
        orgId: "org-1",
        type: "notification_email",
        key: "tpl-1",
        status: "published",
        data: { template_key: "order-shipped" },
      },
    ]);
    mockContent.resolve.mockResolvedValue({
      template_key: "order-shipped",
      subject: "Shipped",
      spec: agentTaskCompleteEmailSpec,
      category: "transactional",
    });

    const insertDelivery = vi.fn(async (input) => ({
      ...input,
      createdAt: new Date(),
      sentAt: null,
      providerMessageId: null,
      error: null,
      attemptCount: 0,
      bodyHtml: input.bodyHtml ?? null,
      bodyText: input.bodyText ?? null,
    }));

    const { service, add } = buildService({ insertDelivery });

    await service.notify("org-1", {
      trigger: "order-shipped",
      to: "buyer@example.com",
      variables: { name: "Alex" },
    });

    expect(add).toHaveBeenCalled();
    expect(insertDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "order-shipped",
        templateId: "order-shipped",
      }),
    );
  });

  it("handleResendWebhook ingests delivery event when delivery matches", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_" + Buffer.from("test-secret-key-32bytes-long!!").toString("base64"));

    const delivery = {
      id: "del-1",
      orgId: "org-1",
      userId: null,
      channel: "email",
      provider: "resend",
      toAddress: "user@example.com",
      subject: "Hi",
      status: "sent",
      providerMessageId: "msg_resend_1",
      error: null,
      trigger: null,
      templateId: null,
      idempotencyKey: null,
      attemptCount: 1,
      bodyHtml: "<p>Hi</p>",
      bodyText: "Hi",
      createdAt: new Date(),
      sentAt: new Date(),
    };

    const findDeliveryByProviderMessageId = vi.fn(async () => delivery);
    const insertDeliveryEvent = vi.fn(async (input) => ({
      row: { ...input, createdAt: new Date() },
      duplicate: false,
    }));
    const updateDelivery = vi.fn();

    const { service } = buildService({
      findDeliveryByProviderMessageId,
      insertDeliveryEvent,
      updateDelivery,
    });

    const payload = JSON.stringify({
      type: "email.opened",
      created_at: "2026-08-01T12:00:00.000Z",
      data: { email_id: "msg_resend_1" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const { createHmac } = await import("node:crypto");
    const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
    const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
    const key = Buffer.from(raw, "base64");
    const id = "evt_test_1";
    const sig = createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");

    const result = await service.handleResendWebhook(payload, {
      "svix-id": id,
      "svix-timestamp": ts,
      "svix-signature": `v1,${sig}`,
    });

    expect(result).toEqual({ received: true, matched: true, duplicate: false });
    expect(insertDeliveryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryId: "del-1",
        eventType: "opened",
      }),
    );

    vi.unstubAllEnvs();
  });
});
