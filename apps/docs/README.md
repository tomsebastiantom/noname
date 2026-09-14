# Noname documentation app

This is the standalone Docusaurus application for the current Noname documentation experience.

It uses:

```text
Markdown/MDX
Diátaxis page types
frontmatter metadata
curated current pages
separate history navigation
```

The original dated documentation remains under the repository `docs/` directory. This app does not move or delete those records.

## Commands

From the repository root:

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:serve
```

From this directory:

```bash
pnpm install --ignore-workspace
pnpm start
pnpm build
```

The package is intentionally named `@noname/docs` and lives at `apps/docs` so it is not confused with the historical `docs/` source tree.
