import type { CommsCredentials } from "../../../secrets/ports";

export interface SmsSendInput {
  to: string;
  body: string;
}

export interface SmsSenderPort {
  send(
    credentials: CommsCredentials,
    input: SmsSendInput,
  ): Promise<{ provider: string; messageId: string }>;
}
