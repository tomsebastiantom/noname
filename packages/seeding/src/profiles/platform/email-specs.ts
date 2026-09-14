/** json-render email specs for demo notification_email CMS entries. */
export const welcomeEmailSpec = {
  root: "html",
  elements: {
    html: { type: "Html", props: {}, children: ["head", "body"] },
    head: { type: "Head", props: {}, children: ["preview"] },
    preview: { type: "Preview", props: { text: "Welcome" }, children: [] },
    body: { type: "Body", props: {}, children: ["container"] },
    container: { type: "Container", props: {}, children: ["greeting", "line2"] },
    greeting: {
      type: "Text",
      props: { text: { $state: "/name", $fallback: "there" } },
      children: [],
    },
    line2: {
      type: "Text",
      props: { text: { $state: "/storeName", $fallback: "our store" } },
      children: [],
    },
  },
} as const;

export const agentTaskCompleteEmailSpec = {
  root: "html",
  elements: {
    html: { type: "Html", props: {}, children: ["head", "body"] },
    head: { type: "Head", props: {}, children: ["preview"] },
    preview: { type: "Preview", props: { text: "Agent task complete" }, children: [] },
    body: { type: "Body", props: {}, children: ["container"] },
    container: { type: "Container", props: {}, children: ["greeting", "heading", "summary"] },
    greeting: {
      type: "Text",
      props: { text: { $state: "/name", $fallback: "Hi" } },
      children: [],
    },
    heading: {
      type: "Heading",
      props: {
        as: "h2",
        text: { $state: "/taskName", $fallback: "Task complete" },
      },
      children: [],
    },
    summary: {
      type: "Text",
      props: { text: { $state: "/summary", $fallback: "" } },
      children: [],
    },
  },
} as const;
