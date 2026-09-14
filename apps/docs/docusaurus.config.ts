import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Noname",
  tagline: "AI-native declarative full-stack platform",
  favicon: "img/favicon.svg",
  url: "https://docs.noname.local",
  baseUrl: "/",
  organizationName: "noname",
  projectName: "noname",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          showLastUpdateTime: false,
          remarkPlugins: [],
          rehypePlugins: [],
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    navbar: {
      title: "Noname",
      items: [
        { type: "docSidebar", sidebarId: "docs", label: "Docs", position: "left" },
        { type: "docSidebar", sidebarId: "reference", label: "Reference", position: "left" },
        { href: "https://github.com/noname/noname", label: "GitHub", position: "right" },
      ],
    },
    footer: {
      style: "dark",
      links: [
        { title: "Learn", items: [{ label: "Get started", to: "/docs/get-started/build-your-first-store" }] },
        { title: "Build", items: [{ label: "Architecture", to: "/docs/concepts/system-overview" }] },
        { title: "Reference", items: [{ label: "Evidence API", to: "/docs/reference/api/evidence" }] },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Noname contributors.`,
    },
    prism: {
      additionalLanguages: ["bash", "json", "yaml", "tsx"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
