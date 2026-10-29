# Machine fragments

Traits, subroutines and server calls inside the machine. Nothing here is accepted into a plan yet; the `.plan` files
change only when a proposal is accepted.

## Proposals

| File | Status |
| --- | --- |
| [proposal-v4.md](proposal-v4.md) | the main design; not accepted |
| [outcome-proposal.md](outcome-proposal.md) | final; to be merged into v4 |
| [calls-next/proposal.md](calls-next/proposal.md) | server calls in the machine, decisions D1–D17; not accepted |
| [revisit.md](revisit.md) | open items against v4 |
| [principles.md](principles.md) | what every proposal is judged against |

## Supporting documents

| File | Used by |
| --- | --- |
| [collections/proposal-each.md](collections/proposal-each.md) | v4 rule 9: the full `.each` design, accepted into v4 |
| [comparison/apps.md](comparison/apps.md) | v4 section 3: the example apps |
| [research/field-validation-effect4.md](research/field-validation-effect4.md) | v4 `Field`: Effect 4 Schema facts |
| [reviews/v4-correctness.md](reviews/v4-correctness.md), [reviews/v4-principles.md](reviews/v4-principles.md) | v4's review findings |
| [calls-next/SYNTHESIS.md](calls-next/SYNTHESIS.md), [calls-next/reviews/](calls-next/reviews/), [calls-next/rewrites/](calls-next/rewrites/) | calls-next's requirements, memory-read review and rewrites |

## Spikes

| Folder | For |
| --- | --- |
| [calls-next/spike/](calls-next/spike/) | calls-next: `tsc -p .`, then `bun stories.ts` |
| [spikes/outcome-channels/](spikes/outcome-channels/) | the outcome proposal's `Outcome` API |
| [spikes/timers-arm/](spikes/timers-arm/RESULTS.md) | v4 schedule `armOn` / `disarmOn` typing |
| [spikes/call-dataflow/](spikes/call-dataflow/) | the data flow of the first in-machine calls draft (superseded by calls-next) |

## Removed

Earlier proposal versions (`proposal.md`, `proposal-v2.md`, `proposal-v3.md`, `collapsed-sketch.md`,
`in-machine-calls-proposal.md`), the prior-art notes (`prior-art/`), the design research and comparison builds
(`research/`, `comparison/`), the v2 and v3 reviews, and the collections problem, candidates, prior art and `.each`
reviews. They are in git at commit `26bf7ab9`:

```bash
git show 26bf7ab9:workflow/plans/flow/references/explorations/machine-fragments/proposal-v3.md
```
