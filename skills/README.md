# Agent skills (editor-agnostic)

Workflow instructions for AI coding agents. **Not tied to Cursor** — any editor or agent (Cursor, Kilo, Claude Code, Copilot, etc.) can read these files.

## Layout

```
skills/
├── README.md                 ← this file
└── spec-driven-ui/
    ├── SKILL.md              ← main workflow (start here)
    ├── reference.md          ← pipeline, file map, anti-patterns
    └── examples.md           ← shipped patterns in this repo
```

Human-readable docs live in `docs/2026-07-25/` (e.g. `SPEC-DRIVEN-UI.md`). Skills are the **action checklist** agents follow when implementing.

## How to use

| Tool | How to point the agent at a skill |
|------|-----------------------------------|
| **Any** | Add to prompt: “Follow `skills/spec-driven-ui/SKILL.md`” |
| **Cursor** | Optional: symlink so Cursor auto-discovers — `ln -s ../../skills/spec-driven-ui .cursor/skills/spec-driven-ui` |
| **Kilo / other** | Reference `skills/<name>/SKILL.md` in project rules or plan files |

## Adding a skill

1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter (`name`, `description`)
2. Keep SKILL.md under ~500 lines; put detail in sibling `reference.md` / `examples.md`
3. Link from the matching doc under `docs/` if one exists
