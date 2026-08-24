---
name: ponytail-gain
description: >
  Show ponytail's measured impact as a compact scoreboard: less code, less
  cost, more speed, from the published agentic benchmark. One-shot display, not a
  persistent mode, and not a per-repo number. Trigger: /ponytail-gain,
  "ponytail gain", "what does ponytail save", "show ponytail impact",
  "ponytail scoreboard".
license: MIT
---

# Ponytail Gain

Display this scoreboard when invoked. One-shot: do NOT change mode, write flag
files, or persist anything.

The figures are from Ponytail's published agentic benchmark: 12 feature tasks
against the same no-skill agent, Haiku 4.5, four runs per task. They are
upstream measurements, not computed from this repo. Source:
`benchmarks/results/2026-06-18-agentic.md` and the upstream README.

## Scoreboard

Render plain ASCII bars. The label carries the published mean result:

```
  ponytail gain                 upstream agentic benchmark · 12 tasks · n=4

  Lines of code   no-skill  ████████████████████  100%
                  ponytail  █████████···········       46%   ▼ 54%
  Cost            no-skill  ████████████████████  100%
                  ponytail  ████████████████····       80%   ▼ 20%
  Time            no-skill  ████████████████████  100%
                  ponytail  ███████████████·····       73%   ▼ 27%

  This repo:  /ponytail-debt  (shortcuts you deferred)
              /ponytail-audit (what's still cuttable)
```

## Honesty boundary

These are upstream benchmark means, not this repo. NEVER print a per-repo savings
number ("you saved X lines/tokens here"): the unbuilt version was never
written, so there is no real baseline to subtract from in a live repo. The
local debt count and audit estimate are diagnostics, not savings baselines;
this card points to them instead of inventing a local benchmark.

For Flow State, never use these upstream percentages to justify deleting a
contract requirement or to claim a local gain. A local claim needs a stated
baseline and locally captured measurements; otherwise report only concrete
diff counts and label them as diff counts.

## Boundaries

One-shot display. Edits nothing, changes no mode.
"stop ponytail" or "normal mode": revert.

Adapted for Flow State from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), MIT licensed. Copyright and permission notice: `../ponytail/LICENSE`.
