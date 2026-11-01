# Overnight plan (2026-10-31)

Written before the run; the morning handback replaces NEXT.md. Every step is its own commit; nothing is pushed; no
`.plan` file is touched. Decisions made on the owner's behalf are logged in `delegated-decisions.md` (big ones as
"delegated, big", with before/after).

## Rules for the night

- **Design by convergence** (AGENTS.md): reviews first, then one redesign that takes every requirement and finding at
  once, the current draft kept as prior art.
- **Delegation:** behaviour, small syntax, and for streams and Stories also big changes (new module, larger API, code
  shape), each logged. If something can't be decided responsibly, stop that part, write it up in NEXT.md, finish the rest.
- **Agents:** Opus for design, revisions and reviews; Sonnet for models and reviews of simple pages; Haiku for the
  feature pages. Stalled agents are stopped; usage is watched.
- **Stop rule:** at most two extra fix-and-review rounds per proposal after the final review. Still Highs → stop, write
  them up, don't merge.

## Track 1: streams (merge 6, proposal-v2)

1. Model re-check of revision 4 (running), without the repair switch.
2. Fixes if the model fails, then model again.
3. Final Opus review: brief's 81 failure cases, 29 integration points, end-to-end read.
4. Highs → convergent revision + model + review (≤ 2 rounds). No Highs → polish.
5. Merge plan (Opus): rules 61 onward, the design's "M6 rule 50/51" placeholders, conflicts logged.
6. Merge in two change sets, proposal moved to `merged/streams/`, then an Opus merge-correctness check and fixes.

## Track 2: Stories (merge 3, from scratch)

1. Brief: done (`merge-3-stories/brief.md`, 72 requirements, 79 failure cases).
2. Fresh design from the brief alone (running), `merge-3-stories/proposal-v2.md`.
3. I settle its three open calls: `Story.ending` vs Testing O3, the fragment Story constructor, streams' Story controls.
4. Opus review (correctness and real Story code) and a Sonnet executable model if it has state tables.
5. Convergent redesign from everything at once; model and final Opus review (≤ 2 more rounds).
6. Merge plan, merge, move to `merged/stories/`, Opus merge-correctness check and fixes.

## Track 3: dispatch desk rewrite (after the merges)

1. Opus plans the rewrite of `references/dispatch-desk/` (49 files) on the merged design, plus expansions that show
   every major piece: operations (holds, keyed lanes, Runtime-owned writes), fragments (an attachment-upload trait, a
   comments panel on two hosts), streams (live queue feed, presence, a streamed assistant reply), entities, Stories.
2. Rewrite in place, one feature per commit (old version stays in git).
3. Opus review: correct use of the design, hacks, repeated wiring. Design issues go into machine-design.md
   (delegated, logged) or open-items.
4. Type-check the Effect-only files. If Stories hasn't merged, its files wait, marked.

## Track 4: `apps/features` (after the merges, parallel with track 3)

1. I set the 13 areas in `vocs.config.ts`: Definition, Machine, Fragments, Collections, Schedules, Operations,
   Entities, Streams, Stories, Views and React, Runtime, Persistence, Inspection and tooling.
2. 13 Haiku agents in parallel, one page each, from scratch, in the README's page shape, sourced from
   machine-design.md, the merged decisions and the plans.
3. Sonnet reviewers in batches of 3–4 pages: wrong or missing keywords, stale syntax, examples against the rules; they
   fix, then one site build (`nub run --filter @flow-state/features build`).
4. One commit per page, one for the fixes. `pages.gen.ts` is generated, never hand-edited.

## Morning handback (NEXT.md, rewritten)

What landed (with commits); every delegated decision, big ones first; anything stopped on, as questions with
before/after; what's left. Then the path to implementation: you accept machine-design.md, the design goes into the
`.plan` files, a small type spike (B13), then `packages/flow-state-rewrite` against the plans with `nub run verify`.
