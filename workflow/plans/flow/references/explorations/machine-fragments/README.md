# Machine fragments

Traits, subroutines and server calls inside the machine. Nothing here is accepted into a plan yet; the `.plan` files
change only when a proposal is accepted.

## The design and what merges into it

[machine-design.md](machine-design.md) is the one design (formerly `proposal-v4.md`; "v4" in its text and in the
other documents names it). Proposals merge into it in this order:

| Order | File | Status | Depends on |
| --- | --- | --- | --- |
| 1 | [merge-1-outcomes.md](merge-1-outcomes.md) | final | nothing |
| 2 | [merge-2-server-calls/proposal.md](merge-2-server-calls/proposal.md) | not accepted; decisions D1–D17 | merge 1: its section 6.4 amends it, and 6.5 lists every change to the design |
| 3 | [open-items.md](open-items.md), items 1–3 | open | each merges once settled; the file is deleted when empty |

Merged proposals move to [merged/](merged/) with their evidence, as the record behind the design.
[merged/each.md](merged/each.md) (`.each`, design rule 9) is already there.

[principles.md](principles.md) is what every proposal is judged against.

## Supporting documents

| File | Used by |
| --- | --- |
| [reference/example-apps.md](reference/example-apps.md) | design section 3: the example apps |
| [reference/effect4-field-validation.md](reference/effect4-field-validation.md) | design `Field`: Effect 4 Schema facts |
| [reviews/design-correctness.md](reviews/design-correctness.md), [reviews/design-principles.md](reviews/design-principles.md) | the design's review findings |
| [merge-2-server-calls/requirements.md](merge-2-server-calls/requirements.md) | server calls: requirements R1–R38, problems P1–P23 |
| [merge-2-server-calls/reviews/](merge-2-server-calls/reviews/), [merge-2-server-calls/rewrites/](merge-2-server-calls/rewrites/) | server calls: the memory-read review, five rewritten apps |

## Spikes

| Folder | For |
| --- | --- |
| [merge-2-server-calls/spike/](merge-2-server-calls/spike/) | server calls: `tsc -p .`, then `bun stories.ts` |
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
