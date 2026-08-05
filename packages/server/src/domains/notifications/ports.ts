import type { CommsCredentials } from "../secrets/ports";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId?: string;
  trigger?: string;
  templateId?: string;
  idempotencyKey?: string;
}

export interface SendTemplatedEmailInput {
  to: string;
  templateId: string;
  variables?: Record<string, string>;
  userId?: string;
  locale?: string;
  trigger?: string;
  idempotencyKey?: string;
}

export interface NotifyInput {
  trigger: string;
  to: string;
  variables?: Record<string, string>;
  userId?: string;
  locale?: string;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  deliveryId: string;
  jobId: string;
  skipped?: boolean;
  duplicate?: boolean;
}

export interface CommsDeliveryDTO {
  id: string;
  orgId: string;
  userId: string | null;
  channel: string;
  provider: string;
  toAddress: string;
  subject: string | null;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  trigger: string | null;
  templateId: string | null;
  idempotencyKey: string | null;
  attemptCount: number;
  createdAt: Date;
  sentAt: Date | null;
}

export interface ListDeliveriesQuery {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface NotificationPreferencesDTO {
  agentTaskEmail: boolean;
  marketingEmail: boolean;
}

export interface EmailSenderPort {
  send(
    credentials: CommsCredentials,
    input: SendEmailInput & { from?: string },
  ): Promise<{ provider: string; messageId: string }>;
}

export interface NotificationsService {
  enqueueEmail(orgId: string, input: SendEmailInput): Promise<SendEmailResult>;
  enqueueTemplatedEmail(orgId: string, input: SendTemplatedEmailInput): Promise<SendEmailResult>;
  notify(orgId: string, input: NotifyInput): Promise<SendEmailResult>;
  listDeliveries(orgId: string, query?: ListDeliveriesQuery): Promise<CommsDeliveryDTO[]>;
  retryDelivery(orgId: string, deliveryId: string): Promise<SendEmailResult>;
  getPreferences(orgId: string, userId: string): Promise<NotificationPreferencesDTO>;
  updatePreferences(
    orgId: string,
    userId: string,
    patch: Partial<NotificationPreferencesDTO>,
  ): Promise<NotificationPreferencesDTO>;
}
