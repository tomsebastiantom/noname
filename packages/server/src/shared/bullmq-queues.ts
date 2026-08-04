/** BullMQ queue names — `{…}` hashtags required for Dragonfly (see docker-compose dragonfly command). */
export const BULLMQ_QUEUES = {
  ANALYTICS: "{analytics-events}",
  AGENT: "{agent-tasks}",
  CATALOG: "{catalog-builds}",
  EMAIL_OUTBOUND: "{email-outbound}",
} as const;
