# Flow State agent guide

Use this file as a router. Read the live source, tests, Workflow records, or proofs needed
for the current task and claim. Do not read the whole repository by default.

## Project authority

- `workflow/plans/` and `workflow/tasks/` own current semantic requirements, accepted
  decisions, project status, and proof obligations. Workflow Specs, when present, are
  indexed by `workflow/spec.index`.
- An unresolved Workflow question blocks only the affected work. Do not fill a gap
  from old source text or implementation behavior without an explicit user decision.
- The former contract pack under `reference/incident-console/implementation/contracts/`
  and the Beads database and exports are historical provenance only. Preserve their
  IDs and receipts for traceability. Their statuses and dependency edges are frozen
  source snapshots, not current readiness; they cannot override Workflow records or
  supply current task status.
- This authority transfer does not mean the rewrite implementation or package cutover
  is complete. Product cutover remains a later, separately gated phase.

## Task modes

- **Change or fix:** carry authorized work through implementation and relevant
  verification. Do not stop at a plan when you can proceed.
- **Plan or review:** inspect and propose within scope. Do not edit, mutate task state,
  commit, or push.
- Continue authorized read-only actions, local worktree or branch edits, and appropriate
  tests without repeated confirmation.
- Infer routine, reversible choices from context. Ask one focused question only when
  missing information changes correctness, scope, or authorization.
- Honor required approval gates. Finish authorized preparation before requesting approval
  and present a concrete, reviewable result. Ask before destructive, irreversible, or
  otherwise unauthorized actions.
- Report concrete blockers and uncertainty. Avoid generic warnings.

## Instruction precedence

- User instructions take precedence over conflicting skill guidance, subject to higher
  priority instructions and permission boundaries.
- For this repository, this authority declaration overrides older role or skill text
  that routes current work to Beads or treats archived contracts as normative.
- If a skill causes a pause, unfinished work, or a change of direction, name the exact
  `SKILL.md` and rule. Distinguish an explicit requirement from your interpretation.
  Continue unaffected authorized work.

## Communication

- State the result early.
- Use plain language, active voice, and short paragraphs or bullets.
- Use lists when information is sequential, parallel, or easier to compare. Avoid
  repetitive transitions and stock phrases.
- Include technical detail when it helps review the work.
- Report changed paths, verification, and remaining uncertainty.

## Repository map

- `packages/flow-state/` — frozen package; never edit.
- `packages/flow-state/src/index.ts`, `react-entry.ts`, `testing.ts`,
  `server.ts`, and `inspect.ts` — public package entrypoints.
- `packages/flow-state/src/core/` — runtime behavior; `src/react/`,
  `src/testing/`, and `src/cli/` — integration surfaces.
- `packages/flow-state-rewrite/src/` — greenfield rewrite package
- `apps/docs/` — Vocs documentation and generated reference artifacts.
- `reference/incident-console/implementation/contracts/` — historical source records;
  preserve them as read-only provenance.
- `codebases/` — research input only. `codebases/effect-v4/` is the primary
  reference for Effect usage. Installed packages and the lockfile remain authoritative
  for exact dependency APIs.

Development uses Node 22.18+, `nub@0.7.5`, TypeScript 7.0.2, Vite Plus, and
Effect 4.0.0-rc.112.

## Verification

- Choose checks from the changed scope and impact. Start with the smallest relevant
  check; broaden only for a new change, failure, or unresolved concern.
- Run `nub run build` when package or CLI output changes.
- Run `nub run docs:build` for documentation or public API changes. Its generator derives API
  reference data from public entrypoints.
- Run `nub run verify` before claiming full workspace verification.
- For instruction-only changes, validate the scoped diff, links, metadata and fences,
  and referenced paths instead of running application tests by default.

## Commands

```sh
nub install                                      # install dependencies
nub run check:toolchain                          # after dependency/compiler changes
node ./tools/oxlint/anti-slop/rules/general-typescript/<rule>.test.ts # focused anti-slop rule test
nub run check                                    # formatting, lint, and type checks
nub run --filter flow-state check:cli-source-types
nub run --filter flow-state check:vnext
nub run --filter flow-state check:packed-consumers
nub run test                                     # workspace test suite
nub run build                                    # package and CLI output
nub run docs:build                               # documentation or public API changes
nub run verify                                   # full closeout gate
```

## Change boundaries

- Before editing, inspect `git status`, the assigned Workflow Plan and Task, relevant
  source and tests, and README guidance. Preserve unrelated worktree changes.
- Make the smallest change at the owning boundary. Check public API changes against
  affected entrypoints, tests, packed consumers, and docs.
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
- For implementation work, read the relevant Workflow Plan and Task, then inspect
  their named source, tests, and proofs. Treat old contract text as provenance only.

## Skills

Load only skills relevant to the task; more than one may apply. The `orchestrator`,
`coder`, and `reviewer` entrypoints define delegation, implementation, and independent
review. Use one primary coder. It records `Workflow requirement -> owner file ->
executable proof -> expected baseline`, makes the task list, then decides whether to delegate
disjoint work to zero, one, or two secondary coders. The primary owns integration and
final coder checks. Record each agent's task, scope, model, and reasoning setting before
dispatch. Follow with three independent reviewers in parallel: `architecture`,
`contract`, and `bug`. Each reviewer reads its assigned skills through the reviewer
entrypoint and then runs the common general-code-practices phase. All three
reviews must pass.
Keep delegation proportional; keep review evidence explicit and proportional.

| Skill                                                      | Agent                            | Reach for it when                                                                    | Do not reach for it when                                                 |
| ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `.agents/skills/typescript-style-guide/SKILL.md`           | coder, reviewer (`architecture`) | Writing Flow State TypeScript or reviewing its style and ownership.                  | Unrelated to Flow State TypeScript.                                      |
| `.agents/skills/code-patterns/SKILL.md`                    | reviewer (`architecture`)        | Architecture-first Flow State TypeScript reviews against CP01–CP21.                  | Generic maintainability review without a Flow State TypeScript boundary. |
| `.agents/skills/api-design/SKILL.md`                       | coder, reviewer                  | Designing or reviewing APIs, usability, or compatibility.                            | No API design decision is involved.                                      |
| `.agents/skills/code-spec/SKILL.md`                        | orchestrator, coder              | Growing one Spec per non-trivial slice after requirement extraction.                 | Trivial changes, raw extraction, implementation review, or a settled slice. |
| `.agents/skills/flow-state-module-refactor/SKILL.md`       | orchestrator, coder              | Simplifying one rewrite module before considering shared abstractions.               | Frozen package, contract authoring, or project-wide cleanup.             |
| `.agents/skills/effect-systems-design/SKILL.md`            | coder, reviewer (`architecture`) | Choosing TypeScript versus Effect or reviewing services, lifetimes, and concurrency. | Ordinary deterministic TypeScript needs no Effect decision.              |
| `.agents/skills/effect-api-documentation/SKILL.md`         | coder, reviewer (`architecture`) | Verifying or documenting exact Effect v4 APIs.                                       | Architectural selection; use `effect-systems-design`.                    |
| `~/.agents/skills/tdd/SKILL.md`                            | coder                            | Requested test-first work or integration tests.                                      | Read-only review or ordinary behavior-proof additions.                   |
| `.agents/skills/workflow-cli/SKILL.md`                    | orchestrator, coder, reviewer    | Reading and maintaining current Plans, Tasks, Specs, and their links.                 | No Workflow artifact operation is needed.                                |
| `.agents/skills/beads/SKILL.md`                            | migration/review                 | Reading historical Bead status and receipts as migration provenance.                 | Current task tracking or status updates.                                  |
| `.agents/skills/flow-state-contract-slice-review/SKILL.md` | reviewer (`contract`)            | Checking one rewrite Workflow Task against its named requirements and proofs.        | General maintainability review or authoring historical source files.      |
| `.agents/skills/performance-quality-bug-hunt/SKILL.md`     | reviewer (`bug`)                 | Hunting concrete bugs, regressions, lifecycle failures, or performance risks.        | Only contract conformance, Effect design, or style is in scope.          |
| `.agents/skills/general-code-practices/SKILL.md`           | reviewer (all)                   | General coding principles enforced after the specialist lens.                        | It does not define review procedure or replace a specialist lens.        |

Agent entrypoints:

- `.agents/agents/coder.md` — primary requirements, delegation, and integration or
  secondary disjoint implementation/research for a Workflow Task.
- `.agents/agents/reviewer.md` — independent read-only verification; assign exactly one `reviewer_type`: `architecture`, `contract`, or `bug`.
- `.agents/agents/orchestrator.md` — one primary coder, up to two secondary coders,
  and three specialist reviewers per Workflow Task, with per-agent model and reasoning
  settings.

## Boundaries

- Always use the pinned nub toolchain, preserve existing worktree changes, run the
  smallest relevant check, and report exactly what was verified.
- Stop before widening the Workflow Task or claiming a proposal, historical source,
  or reference codebase is shipped behavior.
- Keep historical contract files and Beads records unchanged; use Workflow records
  for current requirements, decisions, and task state.
- Never use unpinned latest dependencies, edit generated outputs by hand, erase public
  type information to satisfy a proof, or claim full verification from a focused check.

## Tools

- use `exa` cli for ls extensions like `exa -tree` to validate folder structures

## Workflow

Read [the Workflow CLI skill](.agents/skills/workflow-cli/SKILL.md) before creating,
changing, or linking Workflow records. Keep durable task state in Workflow. The Beads
database and exports are historical provenance; do not mutate them.

Inspect an assigned task and its blockers before work. Update its Workflow status and
record remaining work at handoff. Mark it done only after acceptance criteria, checks,
and required reviews pass. Workflow state does not authorize commits or pushes.

```sh
workflow list task --ready
workflow show @epic.Rewrite --tree
workflow show @task.Rewrite.T1 --why
workflow edit @task.Rewrite.T1 --set status=in_progress
workflow edit @task.Rewrite.T1 --set status=done
workflow check
```

The Workflow CLI validates artifact and graph integrity, not implementation completion.
Keep each task's evidence and unresolved decisions in its owning Workflow record.
