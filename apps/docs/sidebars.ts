import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "index",
    {
      type: "category",
      label: "Get started",
      items: [
        "get-started/agent-project-orientation",
        "get-started/build-your-first-store",
        "get-started/local-development",
      ],
    },
    {
      type: "category",
      label: "How-to guides",
      items: [
        "how-to/create-an-extension",
        "how-to/trace-a-feature",
      ],
    },
    {
      type: "category",
      label: "Concepts",
      items: [
        "concepts/vision",
        "concepts/human-agent-loop",
        "concepts/cms-content-platform",
        "concepts/admin-and-editor-surfaces",
        "concepts/visual-builder",
        "concepts/system-overview",
        "concepts/documents-and-layouts",
        "concepts/machines-and-xstate",
        "concepts/analytics-observability-agents",
        "concepts/edge-and-personalization",
        "concepts/workers-and-deployment",
        "concepts/evidence-and-provenance",
        "concepts/seeding",
      ],
    },
    {
      type: "category",
      label: "Architecture",
      items: [
        "architecture/overview",
        "architecture/data-flow",
        "architecture/control-planes",
        "architecture/building-an-application",
        "architecture/building-blocks",
        "architecture/end-to-end-runtime",
        "architecture/identity-and-platform-integrations",
        "architecture/multi-surface-rendering",
        "architecture/package-boundaries",
        "architecture/extension-lifecycle",
        "architecture/platform-capability-map",
        "architecture/decision-and-evidence-guide",
        "architecture/status-and-change-management",
      ],
    },
    {
      type: "category",
      label: "Decisions",
      items: [
        "decisions/ADR-0001-platform-as-contract",
        "decisions/ADR-0002-human-agent-build-loop",
        "decisions/ADR-0003-multi-surface-spec-rendering",
        "decisions/ADR-0004-identity-and-tenant-boundary",
        "decisions/ADR-0005-xstate-transition-authority",
        "decisions/ADR-0006-domain-vs-extension",
        "decisions/ADR-0007-content-and-cms-boundary",
        "decisions/ADR-0008-analytics-and-agent-optimization",
        "decisions/ADR-0009-evidence-provenance-kernel",
        "decisions/ADR-0010-commerce-ui-ownership",
        "decisions/ADR-0011-seeding-and-fixture-boundaries",
      ],
    },
    {
      type: "category",
      label: "Operations",
      items: [
        "operations/local-stack",
        "operations/troubleshooting",
        "operations/seed-a-commerce-demo",
        "operations/verify-a-checkout",
      ],
    },
    {
      type: "category",
      label: "History",
      items: ["history/overview", "history/implementation-records", "history/audit-reports"],
    },
  ],
  reference: [
    "reference/index",
    {
      type: "category",
      label: "API",
      items: ["reference/api/evidence", "reference/api/machines", "reference/api/capabilities"],
    },
    {
      type: "category",
      label: "Package contracts",
      items: ["reference/packages/seeding", "reference/packages/fixtures"],
    },
    "reference/permissions",
    "reference/seed-profiles",
  ],
};

export default sidebars;
