# Machine fragments

Traits, subroutines and server calls inside the machine. Nothing here is accepted into a plan yet; the `.plan` files
change only when a proposal is accepted.

## The design and what merges into it

[machine-design.md](machine-design.md) is the one design (formerly `proposal-v4.md`; "v4" in its text and in the
other documents names it). Merges 1 and 2 are merged into it (2026-10-30). What is left merges in this order (folder numbers are the order they were written, not the merge order):

| Order | File | Status | Depends on |
| --- | --- | --- | --- |
| 1 | [merge-4-entities/proposal.md](merge-4-entities/proposal.md) | **accepted** 2026-10-30 (E1–E16); merges together with merge 3 | the merged design: who owns a write about an entity, and the conflicts in [merged/server-calls/reviews/entities.md](merged/server-calls/reviews/entities.md) |
| 2 | [merge-3-stories/proposal.md](merge-3-stories/proposal.md) | not accepted; D1–D3 settled, revision 1, open questions in eleven rounds | the merged design and merge 4 (whether records or memory carry entity data); checked against [playback.md](../playback.md) |
| — | [open-items.md](open-items.md) | nothing open: items 1 and 3 closed, 2 parked, 4 merged | its closing notes merge with the design |

Merged proposals move to [merged/](merged/) with their evidence, as the record behind the design:

| File | Merged | Became |
| --- | --- | --- |
| [merged/each.md](merged/each.md) | before the merges | `.each`, design rule 9 |
| [merged/outcomes.md](merged/outcomes.md) | merge 1, 2026-10-30 | the three channels, `Outcome`, the classifier and the cache table (design 2.7.1) |
| [merged/server-calls/proposal.md](merged/server-calls/proposal.md) | merge 2, 2026-10-30 | server calls in the machine (design 2.7, rules 13–25, C rows, decisions D1–D17) |

[principles.md](principles.md) is what every proposal is judged against.

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
