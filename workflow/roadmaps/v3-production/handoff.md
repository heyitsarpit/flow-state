# Handoff: start Flow State v3's production roadmap

Written 2026-11-04 at `0af1d250`, for an agent with no prior context. Repo `/Users/arpit/Developer/flow-state`, branch `flow-rewrite`. Commit locally, never push. Everything is proposed unless marked decided.

## Read, in order

1. `AGENTS.md`, then the memory index `/Users/arpit/.claude/projects/-Users-arpit-Developer-flow-state/memory/MEMORY.md`. Memory holds the working rules; open the files it points to.
2. `workflow/roadmaps/v3-production/roadmap.md`: the plan, its Method, and Authority.
3. `workflow/roadmaps/v3-production/progress.md`: the state, what waits on Arpit, and the example app candidates.
4. `packages/flow-state-v3/prototypes/FOR-ARPIT.md`: the calls, questions and open items from the prototype phase.
5. `packages/flow-state-v3/prototypes/HANDOFF.md` (the "Where it stopped" and "Plan cut" sections) and `round-13/review.md`.
6. The skills you will run: `/Users/arpit/Developer/workflow/skills/suites/workflow/roadmap/SKILL.md`, `policy-convergence/SKILL.md` and `playbook-prototype/SKILL.md`.

## State

- **Prototype phase:** done, at round 13. Its record and code are the authority until the plans are merged. The suite passes 761/761, and every gate fails on a broken runtime. Two Highs are open, to fix in phase 2: H1, a default computed once and shared by every actor; and H2, key versions told apart by field names only.
- **Lint-bomb:** vendored in `tools/lint-bomb/`, applying to `packages/flow-state-v3/src`. `nub run check` passes.
- **`nub run verify`:** fails building the frozen `packages/flow-state`, as it did before. Repairing it waits on Arpit.
- **Decided by Arpit:**
  - the roadmap's shape;
  - the plan merge;
  - no more prototyping after phase 2;
  - the conformance rewrite;
  - React and Next.js only;
  - docs in `apps/docs` generated from source;
  - example apps in `examples/`, later, each explaining itself, with one showing Story presentation;
  - anti-slop deleted.
- **Not yet approved:** the roadmap's text, and R1-R5 in `roadmap.md`.

## First actions

1. Don't run phases until Arpit approves `roadmap.md`. Ask R1-R5 as one numbered round, with before and after and a recommendation each, answered as `R1 A`.
2. Then phase 1, the plan merge (approved). Ask `FOR-ARPIT.md` Q1-Q8 first, since Q1 and Q2 block the most. Then merge one plan or area per iteration: list the edits as before and after with the decision behind each, apply them, and run `workflow check`. Mark every superseded decision with a pointer to its replacement.
3. Also waiting on Arpit: the services choice (types only, or a required list) and the pick of example apps.
4. A review of the roadmap skill itself may arrive from the previous session's agent. If Arpit adopts changes to the skill, reread it before running.

## Rules that bite

- Ask Arpit in numbered rounds. Never present a recommendation as decided.
- Show him a high-level view before writing any large plan.
- Reviews at each 60-minute checkpoint and a final review. Neither is ever a stop.
- Converge instead of patching when a part fails twice.
- Shell commands:
  - bounded with `perl -e 'alarm N; exec @ARGV' --` or `watch.ts`;
  - stdin fed or `</dev/null`; `cat` is `bat`;
  - files only through the Write and Edit tools.
- Up to 8 deterministic processes in parallel, about 16 GB. Browsers and benchmarks run alone.
- Kill your own stray processes by exact pid. Never touch Arpit's Safari or apps.
- One or two agents at a time. Usage: check between agents. Arpit may upgrade his plan; ask before assuming a budget.
