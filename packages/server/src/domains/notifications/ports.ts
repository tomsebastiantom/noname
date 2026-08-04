import type { CommsCredentials } from "../secrets/ports";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  userId?: string;
}

export interface SendTemplatedEmailInput {
  to: string;
  templateId: string;
  variables?: Record<string, string>;
  userId?: string;
  locale?: string;
}

export interface SendEmailResult {
  deliveryId: string;
  jobId: string;
  skipped?: boolean;
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
  getPreferences(orgId: string, userId: string): Promise<NotificationPreferencesDTO>;
  updatePreferences(
    orgId: string,
    userId: string,
    patch: Partial<NotificationPreferencesDTO>,
  ): Promise<NotificationPreferencesDTO>;
}
