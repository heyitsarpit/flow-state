# Handoff: start Flow State v3's production roadmap

Updated 2026-11-07 at `14d05f20`, for an agent with no prior context. Repo
`/Users/arpit/Developer/flow-state`, branch `flow-rewrite`. Commit locally, never push. Everything
is proposed unless marked decided.

## Read, in order

1. `AGENTS.md`, then the memory index
   `/Users/arpit/.claude/projects/-Users-arpit-Developer-flow-state/memory/MEMORY.md`. Memory holds
   the working rules; open the files it points to.
2. `workflow/roadmaps/v3-production/roadmap.md`: the user's constraints, the glossary, the stops
   and review queue, the phases, Authority, Agents, and the runner rules.
3. `workflow/roadmaps/v3-production/progress.md`: the state, what waits on the user, the failure
   ledger, the calls for the user's read, and the example app candidates.
4. `packages/flow-state-v3/prototypes/FOR-ARPIT.md`: the calls, questions and open items from the
   prototype phase.
5. `packages/flow-state-v3/prototypes/HANDOFF.md` ("Where it stopped") and
   `packages/flow-state-v3/prototypes/round-13/review.md`.
6. The roadmap skill, `/Users/arpit/Developer/workflow/skills/suites/workflow/roadmap/SKILL.md`.
   Open other pinned packages only when the roadmap's triggers fire.

## State

- **Prototype phase:** done, at round 13. Its record and code are authoritative until phase 1
  merges the plans. The suite passes 761/761, and every gate fails on a broken runtime. Round 13's
  H1 and H2 are fixed in phase 2.
- **Lint:** lint-bomb `183d43b` is vendored in `tools/lint-bomb/` and applies to
  `packages/flow-state-v3/src`. `nub run check` passes. The style is in `AGENTS.md`, "Code style
  (v3 production)".
- **`nub run verify`:** fails building the frozen `packages/flow-state`. That's round 2's Q5.
- **Decided by the user:** the shape and constraints listed in `roadmap.md`, the plan merge, and
  round 1 of 2026-11-07:
  - blocking stops only where the work can't go on, everything else a review;
  - a required `services` list on every operation;
  - H1 and H2 fixed in phase 2;
  - a 5% usage reserve;
  - phase 2's designs straight into the plans.
- **Not yet approved:** the roadmap itself, pending round 2 (R1, R4, R5, R7 and the `verify`
  fix).
- **Uncommitted on purpose:** the roadmap skill, `policy-delegation` and `ONBOARDING.md` edits in
  the workflow suite; `packages/flow-state-v3/src/_example/edge.ts`;
  `packages/flow-state-v3/lint-eval.md`; and `roadmap-skill-review.md` beside this file.

## First actions

1. If round 2 isn't answered, ask it as `progress.md` lists it. Don't run phases until the user
   approves `roadmap.md`.
2. Then phase 1, the plan merge (approved). Ask `FOR-ARPIT.md` Q1-Q8 first, then the 20 calls.
   Merge one plan or area per iteration: list the edits as before and after, with the decision
   behind each, apply them, run `workflow check`, and mark every superseded decision with a
   pointer to its replacement. Write the Specs last.
3. Record every call you make under delegation in `progress.md`'s review queue. Block only on the
   roadmap's listed blocking stops.

## Rules that bite

- Ask the user in numbered rounds. Never present a recommendation as decided.
- Show a high-level view before writing any large plan.
- Review at each 60-minute checkpoint and at each round's end. Neither is ever a stop.
- Converge instead of patching when a part fails twice; keep the failure ledger.
- Shell commands: bounded with `perl -e 'alarm N; exec @ARGV' --` or `watch.ts`; stdin fed or
  `</dev/null`; files only through the Write and Edit tools.
- Up to 8 deterministic processes in parallel, about 16 GB. Browsers and benchmarks run alone.
- Kill your own stray processes by exact pid; never the user's own apps or processes.
- One or two agents at a time. Check usage between agents; stop at 95% of the weekly limit.
