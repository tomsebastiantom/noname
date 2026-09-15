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
        "how-to/seed-a-commerce-demo",
        "how-to/create-an-extension",
        "how-to/verify-a-checkout",
        "how-to/trace-a-feature",
      ],
    },
    {
      type: "category",
      label: "Concepts",
      items: [
        "concepts/vision",
        "concepts/human-agent-loop",
        "concepts/system-overview",
        "concepts/documents-and-layouts",
        "concepts/machines-and-xstate",
        "concepts/evidence-and-provenance",
        "concepts/seeding",
        "concepts/visual-builder",
        "concepts/edge-and-personalization",
        "concepts/workers-and-deployment",
      ],
    },
    {
      type: "category",
      label: "Architecture",
      items: [
        "architecture/package-boundaries",
        "architecture/extension-lifecycle",
        "architecture/building-an-application",
        "architecture/end-to-end-runtime",
        "architecture/decision-and-evidence-guide",
      ],
    },
    {
      type: "category",
      label: "Decisions",
      items: [
        "decisions/ADR-0001-domain-vs-extension",
        "decisions/ADR-0002-xstate-transition-authority",
        "decisions/ADR-0005-evidence-provenance-kernel",
        "decisions/ADR-0006-commerce-ui-ownership",
        "decisions/ADR-0007-seeding-and-fixture-boundaries",
      ],
    },
    {
      type: "category",
      label: "Operations",
      items: ["operations/local-stack", "operations/troubleshooting"],
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
