# Flow State agent guide

Use this file to navigate, change, and verify Flow State. Read the live source,
tests, contracts, and proofs before making implementation or status claims.

## Useful structure

- `packages/flow-state/` — runtime, public APIs, adapters, CLI, tests, and proofs.
- `packages/flow-state/src/index.ts`, `react-entry.ts`, `testing.ts`,
  `server.ts`, and `inspect.ts` — public package entrypoints.
- `packages/flow-state/src/core/` — runtime behavior; `src/react/`,
  `src/testing/`, and `src/cli/` — integration surfaces.
- `packages/flow-state-rewrite/src/` — greenfield rewrite package; `internal/`
  owns implementation and `public/` owns explicit package entrypoint modules.
- `examples/` — maintained consumers and TypeScript compiler proofs.
- `apps/docs/` — Vocs documentation and generated reference artifacts.
- `reference/incident-console/implementation/` — normative Incident Console
  contract pack. Its `README.md` maps authority; `contracts/` define behavior;
  `revision-spec/accepted/` overrides conflicts; and the greenfield, review,
  and test requirement files define execution discipline. Beads will hold the
  task plan after the inventory is approved.
- `codebases/` — research input only; `codebases/effect-v4/` is the primary
  reference for how Effect features are used. Installed packages and the
  lockfile remain authoritative for exact dependency APIs.

Development uses Node 22.18+, `nub@0.7.5`, TypeScript 7.0.2, Vite Plus, and
Effect 4.0.0-beta.86.

## Commands

```sh
nub install                                      # install dependencies
nub run check:toolchain                          # after dependency/compiler changes
nub run check:anti-slop                          # custom anti-slop rule fixtures
nub run check                                    # formatting, lint, and type checks
nub run --filter flow-state check:cli-source-types
nub run --filter flow-state check:typescript-mode-proofs
nub run --filter flow-state check:vnext
nub run --filter flow-state check:packed-consumers
nub run test                                     # workspace test suite
nub run build                                    # package, CLI, and example output
nub run docs:build                               # documentation or public API changes
nub run test:browser                             # Incident Console browser behavior
nub run verify                                   # full closeout gate
```

Use the smallest relevant check while iterating. Run `build` when package, CLI,
or example output changes; it also runs the example CLI acceptance gate. The docs
generators derive API reference data from public entrypoints and behavior data from
`examples/basic-cached-posts`. Run `verify` before claiming a workspace slice
is complete.

## Working practices

- Read `git status`, relevant source and tests, README guidance, and the active
  contract/task before editing. Preserve unrelated worktree changes.
- Make the smallest change at the owning boundary. Check public API changes against
  affected entrypoints, tests, examples, packed consumers, and docs.
- Add or update executable behavior proofs with semantic changes; source-text checks
  and typechecking alone do not prove runtime behavior.
- Regenerate generated docs and package output through their commands. Do not hand-edit
  `dist/`, `apps/docs/src/generated/`, or `apps/docs/src/pages.gen.ts`.
- For contract work, read only the active task and its named contracts. Reconcile
  conflicting authority before changing implementation semantics.

## Skills

Only the matching skill applies to each task. The `orchestrator`, `coder`, and
`reviewer` entrypoints define delegation, implementation, and independent review.

| Skill | Agent | Reach for it when | Do not reach for it when |
| --- | --- | --- | --- |
| `.agents/skills/typescript-style-guide/SKILL.md` | coder, reviewer (`reviewer_type=style`) | Writing Flow State TypeScript, or running the dedicated style review for ownership, boundaries, composition, APIs, examples, and proofs. | The task is unrelated to Flow State TypeScript, or the reviewer is running another mode. |
| `.agents/skills/effect-systems-design/SKILL.md` | coder, reviewer (`reviewer_type=effect`) | Choosing plain TypeScript versus Effect, or reviewing Effect services, Layers, resources, concurrency, time, host adapters, or public APIs. | The task only needs ordinary deterministic TypeScript, or the reviewer is running another mode. |
| `.agents/skills/effect-api-documentation/SKILL.md` | coder, reviewer (`reviewer_type=effect`) | Writing or reviewing exact Effect v4 module docs, exports, signatures, examples, and version-specific behavior. | Choosing architecture or introducing an Effect abstraction; use `effect-systems-design` for those decisions. |
| `~/.agents/skills/tdd/SKILL.md` | coder | The user requests test-first/red-green-refactor work or explicitly requests integration tests. | Read-only review or ordinary focused behavior-proof additions. |
| `.agents/skills/beads/SKILL.md` | coder, reviewer | The repository uses Beads or the task includes issue IDs, claiming, dependencies, blockers, or durable handoff. | A current-turn execution checklist with no shared task state. |
| `.agents/skills/flow-state-contract-slice-review/SKILL.md` | reviewer (`reviewer_type=contract`) | Reviewing one `packages/flow-state-rewrite` Bead against its active contracts, proof IDs, and deletion obligations. | General maintainability or performance review, or a reviewer running another mode. |
| `.agents/skills/performance-quality-bug-hunt/SKILL.md` | reviewer (`reviewer_type=bug`) | Hunting correctness, regression, lifecycle, concurrency, performance, or adversarial-test failures in a bounded diff. | Contract conformance, Effect design, or style validation is the only question. |

Agent entrypoints:

- `.agents/agents/coder.md` — implementation and focused verification.
- `.agents/agents/reviewer.md` — independent read-only verification; pass exactly one `reviewer_type` (`style`, `effect`, `contract`, or `bug`).
- `.agents/agents/orchestrator.md` — bounded coder/reviewer loop with fixed per-role model and reasoning settings.

## Boundaries

- Always use the pinned nub toolchain, preserve existing worktree changes, run the
  smallest relevant check, and report exactly what was verified.
- Stop before changing a normative contract, widening the task, or treating a
  proposal, old roadmap, or reference codebase as shipped behavior.
- Never use unpinned latest dependencies, edit generated outputs by hand, erase public
  type information to satisfy a proof, or claim full verification from a focused check.

## Tools

- use `exa` cli for ls extensions like `exa -tree` to validate folder structures

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->

## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Beads workflow guidance applies here.
Call the Skill tool with `beads`.
Then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**

- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.

<!-- END BEADS INTEGRATION -->

<!-- bv-agent-instructions-v3 -->

---

## Beads Workflow Integration

This project uses Beads (`bd`) for issue tracking and [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) (`bv`) for graph-aware triage. Issues are stored in `.beads/` and tracked in git. Regenerate `.beads/issues.jsonl` with `bd export -o .beads/issues.jsonl` after mutations. `bv` auto-discovers the supported JSONL files, so agents should use `bd` for issue state and robot-mode `bv` for graph analysis instead of parsing JSONL directly.

### Using bv as an AI sidecar

bv is a graph-aware triage engine for Beads projects. Instead of parsing .beads/issues.jsonl / .beads/beads.jsonl directly or hallucinating graph traversal, use robot flags for deterministic, dependency-aware outputs with precomputed metrics (PageRank, betweenness, critical path, cycles, HITS, eigenvector, k-core).

**Scope boundary:** `bv` advises on *what to work on* through graph metrics. `bd` remains authoritative for readiness and handles creating, modifying, and closing beads. Contract authority, explicit user scope, and phase gates override graph rankings.

**CRITICAL: Use ONLY --robot-* flags. Bare bv launches an interactive TUI that blocks your session.**

#### The Workflow: Start With Triage

**`bv --robot-triage` is your single entry point.** It returns everything you need in one call:

- `quick_ref`: at-a-glance counts + top 3 picks
- `recommendations`: ranked actionable items with scores, reasons, unblock info
- `quick_wins`: low-effort high-impact items
- `blockers_to_clear`: items that unblock the most downstream work
- `project_health`: status/type/priority distributions, graph metrics
- `commands`: copy-paste shell commands for next steps

```bash
bv --robot-triage        # THE MEGA-COMMAND: start here
bv --robot-next          # Minimal: just the single top pick + claim command

# Token-optimized output (TOON) for lower LLM context usage:
bv --robot-triage --format toon
```

Before claiming, verify current state with `bd show <id> --json` and `bd ready`. Recommendations can include graph-important blocked or assigned work, and generated claim commands may target unavailable tools. Never claim from `bv` output alone.

#### Other bv Commands

| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with unblocks lists |
| `--robot-priority` | Priority misalignment detection with confidence |
| `--robot-insights` | Full metrics: PageRank, betweenness, HITS, eigenvector, critical path, cycles, k-core |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-suggest` | Hygiene: duplicates, missing deps, label suggestions, cycle breaks |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified issues |
| `--robot-graph [--graph-format=json\|dot\|mermaid]` | Dependency graph export |

#### Scoping & Filtering

```bash
bv --robot-plan --label backend              # Scope to label's subgraph
bv --robot-insights --as-of HEAD~30          # Historical point-in-time
bv --recipe actionable --robot-plan          # Pre-filter: ready to work (no blockers)
bv --recipe high-impact --robot-triage       # Pre-filter: top PageRank scores
```

### bd Commands for Issue Management

```bash
bd ready                              # Show issues ready to work (no blockers)
bd list --status=open --json          # All open issues
bd show <id> --json                   # Full issue details with dependencies
bd create --title="..." --type=task --priority=2 --json
bd update <id> --claim                # Claim atomically
bd close <id> --reason="Completed"
bd close <id1> <id2> --reason="Completed"
bd export -o .beads/issues.jsonl      # Refresh the passive JSONL export
```

### Workflow Pattern

1. **Triage**: Run `bv --robot-triage` to find the highest-impact actionable work
2. **Verify and claim**: Use `bd show <id>`, confirm it appears in `bd ready`, then run `bd update <id> --claim`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id> --reason="Completed"`
5. **Export**: Run `bd export -o .beads/issues.jsonl` after Beads mutations so `bv` reads current state

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers 0-4, not words)
- **Types**: task, bug, feature, epic, chore, docs, question
- **Blocking**: `bd dep add <issue> <depends-on>` adds dependencies

### Git Policy

`bd` does not grant permission to commit or push. Follow this repository's git instructions before staging, committing, or pushing. If the repository says "commit only when asked," that rule overrides any generic workflow advice.

<!-- end-bv-agent-instructions -->
