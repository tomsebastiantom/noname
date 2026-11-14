/** BullMQ queue names — `{…}` hashtags required for Dragonfly (see docker-compose dragonfly command). */
export const BULLMQ_QUEUES = {
  ANALYTICS: "{analytics-events}",
  AGENT: "{agent-tasks}",
  CATALOG: "{catalog-builds}",
  EMAIL_OUTBOUND: "{email-outbound}",
  WEBHOOK_OUTBOUND: "{webhook-outbound}",
  EXTENSION_DELIVERY: "{extension-delivery}",
  PROVIDER_EVENTS: "{provider-events}",
  EVAL: "{eval-runs}",
  /** Scheduled platform work � one repeatable job per definition (see domains/schedules). */
  SCHEDULES: "{platform-schedules}",
  /** Tenant provisioning steps — retried, so a failed step is not a stalled tenant. */
  PROVISIONING: "{tenant-provisioning}",
} as const;
