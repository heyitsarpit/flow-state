# Flow State

## Where things live
- `workflow/plans/flow/` — current plans; `workflow/specs/core/` — the core's Specs (revisable guides). The old design
  (`machine-design.md`) was absorbed into them and deleted; history is at commit `20986677` (see
  `workflow/plans/flow/references/README.md`);
  deferred and open items are in `references/proposals/` (revisit.md, open-items.md).
- `reference/` — historical. Read-only. Archived plans, tasks and Beads were deleted (commit `20986677` has them).
- `packages/flow-state-v3/` — the current build; runtime first. Prototypes are in its `prototypes/` and never become production code.
- `packages/flow-state-rewrite/`, `packages/flow-state/` — frozen, never edit.
- `apps/docs/` — docs. Generated files are produced by commands; don't hand-edit them.
- `codebases/effect-v4/` — Effect reference. Installed packages are what's authoritative.

## Workflow

`workflow/` is this project's local wiki: the record of what we're building, why, and how. Read it before you plan
or change code, and keep it current as you work.

- **Plans** (`workflow/plans/`): what we're building and why. Goals, outcomes, and decisions with their reasons.
- **Tasks** (`workflow/tasks/`): how we execute. Epics split into phases and Tasks, each with acceptance, gates and
  evidence. An Epic carries its own loop: how to run it, how often to review, when to stop.
- **Specs** (`workflow/specs/`): the code's skeleton. Requirements, Invariants and tests that code is built from and
  checked against.

How to use it:
- Start with `workflow status` and `workflow next`. `workflow show @id` reads any record.
- Treat the records as the source of truth over chat history: when they disagree, follow the record and say so.
- Write down what you decide as you go: a decision or result goes in a note or comment on its record
  (`workflow edit @id --now --text "comment=…"`), with why and how to reverse it.
- Change a record's scope only with the user's approval. Mark everything not yet approved as proposed.
- Cite records rather than restating them: `@id`, `code:path#symbol`, `skill:name#heading`.
- Every prose section is valid Markdown plus those links; lines are at most 120 characters. Run
  `workflow format --write`, then `workflow check`, before you finish.

## Commands
Use the pinned `nub` toolchain. See `package.json` for scripts.
```sh
nub run check        # format, lint, types
nub run check:fix    # lint + format fixes
nub run test
nub run docs:build   # public API or docs changes
nub run verify       # full gate; don't claim full verification without it
workflow check       # see .agents/skills/workflow-cli/SKILL.md before editing Workflow records
```

## Code style (v3 production)
- Write in lint-bomb's style before linting: read `tools/lint-bomb/STYLE.md` with its code
  companion `tools/lint-bomb/examples/style.ts` and the composed examples (`booking.ts`,
  `tracking.ts`).
  `tools/lint-bomb/FLOW-STATE.md` says which rules apply here and why. The examples' Effect
  workflows, `Ref`, `Layer`, HTTP and SQL recipes are for the host and app edges, not the core.
- House rules: each fact lives in one place; decode once at the boundary with Schema and trust
  the result.
- Store facts, derive views: never store a value other fields already determine, such as a count
  beside its list. Cache only when measured, and update it in the same transition.
- Don't write any implicit state machines, find and refactor any implicit state machine you find.
- The core (everything outside `src/host/`) is plain TypeScript:
  - pure and synchronous: no Effect runtime (`Effect.gen`, `run*`, `try`), no promises or timers.
    A turn runs in about 0.2 ms, and Effect there costs 20-25x per call;
  - deterministic: no clock, randomness or host APIs. Ids come from the runtime's mint, so a story
    or search replays exactly;
  - returns work as data (`{ state, effects }`); the driver in `src/host/` runs it with Effect;
  - Effect's data types are fine where they cost little: `Option`, `Result`, `Data`, `Schema`.
    Hot loops avoid per-element allocation (`HashMap` and `Data` constructors cost 5-17x a plain
    structure);
  - expected failures are values; only defects are thrown.
- The host and edges (`src/host/`, adapters, the CLI) use Effect fully: services, layers, scoped
  resources, `Effect.fn`, `Schedule`, `Clock`.
- Doc comments only on exported API, in Effect's shape (summary, When to use, Details, Gotchas,
  examples). No other comments unless an outside constraint forces one.
- Before finishing: `nub run check:fix`, then `nub run check` with zero errors and zero warnings.
  Fix the code; suppress a rule only with a reason on the line, and never to make a check pass.

## Working with Arpit

### Talking
- Answer the question asked first. Don't act on it until I say go.
- Be short. When I'm tired, give one example with comments on the lines I should look at.
- Handoffs and next steps: 5–10 lines, with exact file paths, in order.
- Work on one thing at a time. Tell me about background work only once it's finished.

### Showing designs
- Show code. Give small before/after examples that are complete: definition, machine, and fragment written in full, no `…`.
- Mark every keyword: say whether it's **new**, **renamed**, existing, or user-defined.
  `// NEW: armOn   // user-defined: Unsettled   // existing: on`
- List what's added as well as what's dropped.
- Start from where the data comes from. Show how the value gets from the real API (fetch, SDK, AbortController) into ours. Flow is not a network library.
- Make it general. Test it against many very different real-world cases, not one example.

### API judgement
- Order of priority: correctness first, then how easy the code is to read at a glance, then agent UX. Prefer standard upfront contracts to clever hybrids.
- Locality: a property sits next to the thing it describes.
- Don't leak internal wiring (ids, keys, timers) into user code.
- Follow Effect/Schema conventions. Check prior art first (Effect, TanStack DB, XState, research).
- Don't break static analysis, the single graph or runtime, Stories, or CLI inspection. Truth is a compilation target.
- Exercise abstract thinking and consider the broad implications of any API or feature change for the rest of the system. Tell agents to do the same.
- Question whether each addition is worth it. Cutting scope for correctness is fine.
- Design by convergence. Fixing findings one review at a time solves problems in increments and leaves case-by-case rules. So run the reviews first; once several rounds have surfaced the problems, gather every requirement and finding at once and redesign from scratch for one API that handles all of them, keeping the current draft as prior art. A holistic API is only possible after that iteration.

### Decisions and files
- Ask me in numbered rounds: options, before/after, your recommendation. I reply with `Q1 A`. Write down only what I confirm.
- Never present something as decided unless I accepted it. Mark everything else as proposed.
- Before you edit, delete, or merge into a plan, list the change and wait for my yes.
- Put new ideas in a new proposal file. Don't overwrite one. Superseded proposals stay as prior art.
- Deferred items go in `revisit.md`.
- Commit only when I say. "Commit first" means commit before you change anything. Never push unless asked.
- Run the linter and formatter when you're done changing code.

### Agents
- You decide. Reviewer findings are advice, and you have the most context.
- Opus: design, proposals, from-scratch redesigns, and reviews (one Opus covers correctness and real code against the proposal; flag hacks and faked features). Sonnet: simple coding work, such as executable models. Haiku: research fan-out only.
- Every review, research or survey task given to Opus launches with 4 Haiku sidecars at the same time, each
  attacking the same problem from a different named angle. Sidecars are read-only, run no gates or benchmarks, and
  return findings with file:line evidence, not verdicts. The owning Opus agent starts its own sidecars, receives
  their findings, verifies them and folds them into its one report; sidecars never report to the coordinator.
- The owner exercises its own judgement on every Haiku result and never accepts one on the sidecar's word: it reads
  every line of a sidecar's code, re-runs the check itself, confirms a wrong runtime fails for the expected reason,
  verifies each finding before using it, and logs each result as accepted, changed or rejected, with why.
- Haiku agents always run at effort high (sidecars, research fan-out, review sidecars); set `effort: "high"`
  whenever starting one, and tell any lead that starts its own to do the same.
- In prototype work the Opus builder is a lead (adopted 2026-11-08; runners get the oracle code, a reviewer
  sidecar checks every oracle, harness or runtime change): it plans the round's tasks up front and delegates bounded ones to up
  to 4 Haiku sidecars at once (coders on disjoint files with an acceptance check, runners for gates and traces,
  reviewers of one diff against one rule). The lead owns the design, reads every diff, and alone commits.
- Lenses (correctness, simplicity, agent UX, generality, consistency, semantics, type spike) are for judging proposals, not for shaping them.
- From-scratch agents get the problem and the gaps, not the old draft, so they don't inherit its assumptions.
- Watch usage limits. Check that running agents are actually making progress.
