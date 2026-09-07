# Flow State agent guide

Use this file to navigate, change, and verify Flow State. Read the live source,
tests, contracts, and proofs before making implementation or status claims.

## Task Execution & Autonomy

- For implementation or fix requests, carry the authorized work through implementation
  and relevant verification. Do not stop at a proposed plan when you can proceed.
- Make reasonable assumptions for routine, reversible decisions. Ask a focused question
  when missing information materially affects correctness, scope, or authorization.
- Continue with authorized read-only actions, local worktrees, branch edits, and
  appropriate tests without repeatedly asking.
- Before requesting approval, finish the preparation that is already authorized and
  present a concrete, reviewable result.
- Respect required approval gates. Ask before destructive, irreversible, or otherwise
  unauthorized actions.
- Avoid boilerplate warnings about hypothetical risks. Explain concrete blockers or
  material risks when relevant.

Planning and read-only requests authorize inspection and proposals, not edits or
task-state changes.

## Instruction Conflicts

- Explicit user instructions take precedence over conflicting skill guidelines,
  subject to higher-priority instructions and actual permission boundaries.
- If a skill causes a pause or deviation, identify the file and relevant rule, and
  explain whether it is an explicit requirement or your interpretation. Continue
  any unaffected authorized work.

## Style & Output

- Lead with the result. Use plain language, active voice, and concise paragraphs.
  Include technical details that help assess the work.
- Use lists when they improve readability; avoid repetitive transitions and stock
  phrases such as "it's worth noting", "delve", "leverage", and "Bottom line".
- Report what changed, what was verified, and any remaining uncertainty.

## Verification

- Match verification to the scope and impact of the change. Complete required checks;
  expand testing when a concrete unresolved concern justifies it.

## Useful structure

- `packages/flow-state/` — frozen package; never edit.
- `packages/flow-state/src/index.ts`, `react-entry.ts`, `testing.ts`,
  `server.ts`, and `inspect.ts` — public package entrypoints.
- `packages/flow-state/src/core/` — runtime behavior; `src/react/`,
  `src/testing/`, and `src/cli/` — integration surfaces.
- `packages/flow-state-rewrite/src/` — greenfield rewrite package
- `examples/` — maintained consumers and TypeScript compiler proofs.
- `apps/docs/` — Vocs documentation and generated reference artifacts.
- `reference/incident-console/implementation/contracts` — readonly contracts.
- `codebases/` — research input only; `codebases/effect-v4/` is the primary
  reference for how Effect features are used. Installed packages and the
  lockfile remain authoritative for exact dependency APIs.

Development uses Node 22.18+, `nub@0.7.5`, TypeScript 7.0.2, Vite Plus, and
Effect 4.0.0-rc.112.

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
`examples/basic-cached-posts`.

Run the required checks for the changed scope. Run `nub run verify` before claiming
full workspace verification. For instruction-only changes, validate the diff, links,
and metadata unless the task explicitly requires additional checks.

## Coding practices

- Read `git status`, relevant source and tests, README guidance, and the active
  contract/task before editing. Preserve unrelated worktree changes.
- Make the smallest change at the owning boundary. Check public API changes against
  affected entrypoints, tests, examples, packed consumers, and docs.
- Add or update executable behavior proofs with semantic changes; source-text checks
  and typechecking alone do not prove runtime behavior.
- Separate adjacent top-level declarations with one blank line. Closely related
  one-line constants may stay together. Do not add blank lines mechanically within
  a declaration or workflow phase.
- Keep small features in their parent directory. Give a self-contained module its
  own directory, with implementation, private helpers, codecs, and tests together.
  Name directories by module, not by runtime or proof category.
- Add re-export files only for a real public route.
- Regenerate generated docs and package output through their commands. Do not hand-edit
  `dist/`, `apps/docs/src/generated/`, or `apps/docs/src/pages.gen.ts`.
- For contract work, read only the active task and its named contracts. Reconcile
  conflicting authority before changing implementation semantics.

## Skills

Load only skills relevant to the task; more than one may apply. The `orchestrator`,
`coder`, and `reviewer` entrypoints define delegation, implementation, and independent
review. Specialist reviewers use their assigned mode. Combined `reviewer_type=slice`
reviewers load all guidance relevant to the changed boundary in one independent pass.

| Skill | Agent | Reach for it when | Do not reach for it when |
| --- | --- | --- | --- |
| `.agents/skills/typescript-style-guide/SKILL.md` | coder, reviewer (`style`) | Writing Flow State TypeScript or reviewing its style and ownership. | Unrelated to Flow State TypeScript. |
| `.agents/skills/api-design/SKILL.md` | coder, reviewer | Designing or reviewing APIs, usability, or compatibility. | No API design decision is involved. |
| `.agents/skills/flow-state-module-refactor/SKILL.md` | orchestrator, coder | Simplifying one rewrite module before considering shared abstractions. | Frozen package, contract authoring, or project-wide cleanup. |
| `.agents/skills/effect-systems-design/SKILL.md` | coder, reviewer (`effect`) | Choosing TypeScript versus Effect or reviewing services, lifetimes, and concurrency. | Ordinary deterministic TypeScript needs no Effect decision. |
| `.agents/skills/effect-api-documentation/SKILL.md` | coder, reviewer (`effect`) | Verifying or documenting exact Effect v4 APIs. | Architectural selection; use `effect-systems-design`. |
| `~/.agents/skills/tdd/SKILL.md` | coder | Requested test-first work or integration tests. | Read-only review or ordinary behavior-proof additions. |
| `.agents/skills/beads/SKILL.md` | orchestrator, coder, reviewer | Durable tasks, dependencies, ownership, or handoff. | A current-turn checklist with no shared task state. |
| `.agents/skills/flow-state-contract-slice-review/SKILL.md` | reviewer (`contract`) | Checking one rewrite Bead against its named contracts and proofs. | General maintainability review or contract authoring. |
| `.agents/skills/performance-quality-bug-hunt/SKILL.md` | reviewer (`bug`) | Hunting concrete bugs, regressions, lifecycle failures, or performance risks. | Only contract conformance, Effect design, or style is in scope. |

Agent entrypoints:

- `.agents/agents/coder.md` — implementation and focused verification.
- `.agents/agents/reviewer.md` — independent read-only verification; pass exactly one `reviewer_type`: `slice` by default, or `style`, `effect`, `contract`, or `bug` for a bounded specialist question.
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

## Beads

Read [the Beads skill](.agents/skills/beads/SKILL.md) using the available skill loader
or filesystem, then use the `bd` CLI.

### Rules

- Use Beads for durable task tracking and project knowledge; do not create markdown
  TODO files or parallel project ledgers. Run `bd prime` when context is missing or stale.
- Inspect the full task, ownership, and dependencies before claiming. Verify readiness
  with `bd show <id> --json` and `bd ready`; never claim from graph recommendations alone.
  In delegated work, follow the role files for task-state ownership.
- Close work only after its acceptance criteria, required checks, and assigned review
  pass. Record remaining work and blockers at handoff.
- Issues live in the local Dolt database. `.beads/issues.jsonl` is a passive export;
  regenerate it with `bd export -o .beads/issues.jsonl` after mutations. Do not edit it
  by hand or treat it as live task state.
- Beads does not authorize staging, committing, pushing, or Dolt remote sync. Follow
  explicit user authorization. Report changed files, validation, and remaining task
  state at handoff; report the exact command and error if an authorized action fails.

### Common commands

```sh
bd prime                             # Refresh missing or stale context
bd ready                             # Find unblocked work
bd list --status=open --json          # List open issues
bd show <id> --json                   # Inspect full task and dependencies
bd update <id> --claim                # Claim work atomically
bd create --title="..." --type=task --priority=2 --json
bd dep add <issue> <depends-on>       # Record a dependency
bd close <id> --reason="Completed"   # Close verified work
bd remember "..."                    # Record durable project knowledge
bd export -o .beads/issues.jsonl      # Refresh the passive export
```

### Graph analysis

When selecting work, start with `bv --robot-triage`. For an assigned task, inspect
it directly with `bd show`. Use only `bv --robot-*` modes; bare `bv` opens an
interactive UI. Graph rankings advise selection; live `bd` state determines
readiness. User scope, active contracts, and phase gates take precedence over rankings.

```sh
bv --robot-triage                         # Ranked recommendations and project health
bv --robot-next                           # Single top recommendation
bv --robot-triage --format toon           # Compact output
bv --robot-plan --label backend           # Plan within a label
bv --recipe actionable --robot-plan       # Plan filtered actionable work
bv --robot-diff --diff-since <ref>         # Issue changes since a revision
```

| Command | Returns |
| --- | --- |
| `--robot-plan` | Execution tracks and unblocked work |
| `--robot-priority` | Priority mismatches |
| `--robot-insights` | Dependency graph metrics |
| `--robot-alerts` | Stale issues and blocking cascades |
| `--robot-suggest` | Possible duplicates, missing dependencies, and cycles |
| `--robot-graph --graph-format=mermaid` | Dependency graph export |
