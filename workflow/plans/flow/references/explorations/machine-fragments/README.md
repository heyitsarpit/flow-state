# Machine fragments

Traits, subroutines and server calls inside the machine. Nothing here is accepted into a plan yet; the `.plan` files
change only when a proposal is accepted.

## Work order

The open proposals are worked one at a time, in this order (owner, 2026-10-30). Every one of them depended on
operations-in-definition, so it went first (merged 2026-10-30). Stories goes last. Streams is somewhere in between. The positions marked
*proposed* have not been confirmed.

| Order | Proposal | Position |
| --- | --- | --- |
| 1 | operations-in-definition: merged 2026-10-30 ([merged/operations/merge-plan.md](merged/operations/merge-plan.md)) | done (OD24) |
| 2 | merges 4 and 5: merged 2026-10-30 ([merge-plan-4-5.md](merge-plan-4-5.md)) | done (OD24) |
| 3 | [merge-6-streams/proposal.md](merge-6-streams/proposal.md) | **confirmed in the middle**; exact slot *proposed* |
| 4 | [operations-in-fragments/exploration.md](operations-in-fragments/exploration.md) | *proposed* |
| 5 | [merge-3-stories/proposal.md](merge-3-stories/proposal.md) | **confirmed last** |

## The design and what merges into it

[machine-design.md](machine-design.md) is the one design (formerly `proposal-v4.md`; "v4" in its text and in the
other documents names it). Merges 1, 2, 4, 5 and operations-in-definition are merged into it (2026-10-30). What is left merges in the work order above (folder numbers are the order they were written, not the merge order):

| Order | File | Status | Depends on |
| --- | --- | --- | --- |
| 1 | [merge-6-streams/proposal.md](merge-6-streams/proposal.md) | **accepted** 2026-10-30 (M6-D1–D4); not yet reviewed | the merged design, merge 4 and operations ([merged/operations/proposal.md](merged/operations/proposal.md): streams under `operations`, `input`/`output`, a required `key`): streams in three layers |
| 2 | [merge-3-stories/proposal.md](merge-3-stories/proposal.md) | not accepted; D1–D3 settled, revision 1, open questions in eleven rounds | the merged design, merge 4 ([merged/entities.md](merged/entities.md): whether records or memory carry entity data) and operations (`Story.ending`, `s.operations`); checked against [playback.md](../playback.md) |
| — | [open-items.md](open-items.md) | nothing open: items 1 and 3 closed, 2 parked, 4 merged | its closing notes merge with the design |

Merged proposals move to [merged/](merged/) with their evidence, as the record behind the design:

| File | Merged | Became |
| --- | --- | --- |
| [merged/each.md](merged/each.md) | before the merges | `.each`, design rule 9 |
| [merged/outcomes.md](merged/outcomes.md) | merge 1, 2026-10-30 | the three channels, `Outcome`, the classifier and the cache table (design 2.7.1) |
| [merged/server-calls/proposal.md](merged/server-calls/proposal.md) | merge 2, 2026-10-30 | server calls in the machine (design 2.7, rules 13–25, C rows, decisions D1–D17) |
| [merged/entities.md](merged/entities.md) | merge 4, 2026-10-30 | entity domains in the machine (design 2.8, rules 26–38, C21–C30, decisions E1–E18) |
| [merged/entity-analysis/proposal.md](merged/entity-analysis/proposal.md) | merge 5, 2026-10-30 | statically analysable domains (design 2.8 amendments, rules 34–35, M5-D1–M5-D10; rules A1–A12 for entity-domain.md) |
| [merged/operations/proposal.md](merged/operations/proposal.md) | operations, 2026-10-30 | server interaction declared once under `operations`; the Runtime's write lanes (design 2.7, 2.7.13–2.7.16, rules 39–47, C31–C53, decisions OD1–OD25) |

[principles.md](principles.md) is what every proposal is judged against.
[audit-multiplicity.md](audit-multiplicity.md) (2026-10-31) audits every design document for how many of each thing exist,
which one each reference names, and what exists when; its changes are marked in the design and merges 3, 4 and 6, and
merge 5's are listed in its section 4.

## Supporting documents

| File | Used by |
| --- | --- |
| [reference/example-apps.md](reference/example-apps.md) | design section 3: the example apps |
| [reference/effect4-field-validation.md](reference/effect4-field-validation.md) | design `Field`: Effect 4 Schema facts |
| [reviews/design-correctness.md](reviews/design-correctness.md), [reviews/design-principles.md](reviews/design-principles.md) | the design's review findings |
| [merged/server-calls/requirements.md](merged/server-calls/requirements.md) | server calls: requirements R1–R38, problems P1–P23 |
| [merged/server-calls/reviews/](merged/server-calls/reviews/), [merged/server-calls/rewrites/](merged/server-calls/rewrites/) | server calls: the memory-read and entity-domain reviews, five rewritten apps |

## Spikes

| Folder | For |
| --- | --- |
| [merged/server-calls/spike/](merged/server-calls/spike/) | server calls: `tsc -p .`, then `bun stories.ts` |
| [merged/entity-analysis/spike/](merged/entity-analysis/spike/) | merge 5: `tsc -p .`, then `bun main.ts` |
| [merged/operations/lane-model/](merged/operations/lane-model/RESULTS.md) | operations: the write-lane model, `tsc -p .`, then `bun main.ts`; `python3 mutations.py` |
| [spikes/outcome-channels/](spikes/outcome-channels/) | merge 1: the `Outcome` API |
| [spikes/schedule-triggers/](spikes/schedule-triggers/RESULTS.md) | the design's schedule `armOn` / `disarmOn` typing |
| [spikes/server-calls-draft/](spikes/server-calls-draft/) | the data flow of the first in-machine calls draft (superseded by merge 2) |

## Removed

Earlier proposal versions (`proposal.md`, `proposal-v2.md`, `proposal-v3.md`, `collapsed-sketch.md`,
`in-machine-calls-proposal.md`), the prior-art notes (`prior-art/`), the design research and comparison builds
(`research/`, `comparison/`), the v2 and v3 reviews, and the collections problem, candidates, prior art and `.each`
reviews. They are in git at commit `26bf7ab9`, under their old names:

```bash
git show 26bf7ab9:workflow/plans/flow/references/explorations/machine-fragments/proposal-v3.md
```
