---
title: Architecture decisions and implementation evidence
sidebar_position: 4
status: current
owner: architecture
last_verified: 2026-09-14
audience: [agent, contributor, architect]
---

# Architecture decisions and implementation evidence

A good technical document answers four different questions without mixing them:

```text
what do we believe?      decision or explanation
how does it work?       architecture or concept
how do I do it?         tutorial or how-to
is it actually true?   source, test, commit, or verification record
```

## Decision document scope

Use an ADR for one durable choice:

- ownership boundary
- runtime authority
- security boundary
- provider strategy
- persistence model
- extension contract

An ADR should not become a weekly status report.

## Required ADR fields

```yaml
status: proposed | accepted | superseded | rejected
owner: package or team
recorded: YYYY-MM-DD
last_verified: YYYY-MM-DD
source_documents: []
implementation_evidence: []
```

## Evidence levels

| Level | Example | Meaning |
|---|---|---|
| Source | current implementation path | behavior exists in code |
| Test | focused or full test | contract is executable |
| Build | package/site build | artifacts compile |
| Local runtime | seeded/browser verification | path works in the local stack |
| Public runtime | deployed edge/provider check | external boundary works |

Do not write “complete” when only a design page exists. Do not rewrite a historical plan to make it look current; create a current page with evidence and link the old record.

## Git/GitHub provenance

Every current architecture page should include:

- relevant package paths
- focused test paths
- dated verification record when available
- commit or pull request when the decision was introduced
- current roadmap link when scope remains open

Repository: [tomsebastiantom/noname](https://github.com/tomsebastiantom/noname)

## Agent rule

When an agent cannot find evidence, it must say what is unknown and stop short of claiming implementation. Missing evidence is a documentation or verification task, not permission to invent a package boundary.
