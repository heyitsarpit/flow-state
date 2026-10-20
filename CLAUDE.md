# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

## Current task and decision records

Workflow plans and tasks own current requirements, accepted decisions, task status, and proof
obligations. Specs are indexed by [`workflow/spec.index`](./workflow/spec.index). Follow
[`AGENTS.md`](./AGENTS.md) for task modes, boundaries, and Workflow commands. The Beads database,
exports, and former contract pack are historical provenance; they do not establish current
requirements or readiness.

## Project guidance

Use [AGENTS.md](./AGENTS.md) for repository-wide task modes, boundaries, commands,
verification, and skill routing. Read the role entrypoint that matches the work:

- [.agents/agents/orchestrator.md](./.agents/agents/orchestrator.md) — delegated
  orchestration and the single-writer workflow.
- [.agents/agents/coder.md](./.agents/agents/coder.md) — implementation and focused
  verification.
- [.agents/agents/reviewer.md](./.agents/agents/reviewer.md) — independent read-only
  review through one applicable lens.
