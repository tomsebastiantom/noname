# Agent skills (editor-agnostic)

Workflow instructions for AI coding agents. **Not tied to Cursor.**

Skills ship **without the codebase** — they describe **how to build**, not where files live in one repo. When working inside a project, discover paths by searching the tree; do not maintain file maps in skills.

## Layout

```
skills/
├── README.md
└── spec-driven-ui/
    ├── SKILL.md           ← start here (workflow)
    ├── props-contract.md  ← flat props invariant (no config+labels split)
    ├── reference.md       ← pipeline, data model, patterns
    └── examples.md        ← pattern recipes (generic)
```

## Linking rules

| Target | OK? | Purpose |
|--------|-----|---------|
| **Sibling files in `skills/`** | Yes | Workflow and rules |
| **GitHub URLs** (upstream libs, e.g. json-render) | Yes | External API the agent can read |
| **Repo code paths** | **No in skills** | Repo-specific; agent finds these in the project |
| **`docs/` or other repo folders** | **No** | Human notes — not agent workflow |

## How to use

| Tool | How |
|------|-----|
| **Any agent** | “Follow `skills/spec-driven-ui/SKILL.md`” |
| **Cursor** | Optional: `ln -s ../../skills/spec-driven-ui .cursor/skills/spec-driven-ui` |
