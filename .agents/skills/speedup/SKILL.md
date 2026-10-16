---
name: speedup
description: >-
  Measure current performance, research credible comparisons, and propose ambitious targets.
disable-model-invocation: true
metadata:
  kind: procedure
---

# Speedup

Find how much faster or cheaper the system could become before choosing an optimization target.

1. Name the operation, workload, environment, guarantees, and investigation budget.
2. Benchmark the current system using [benchmark-checklist](../benchmark-checklist/SKILL.md).
   Reuse valid measurements. If execution is unavailable, report the missing baseline.
3. Research high-quality industry measurements. Cite original sources and their conditions.
   Explain differences in hardware, workload, and guarantees; reject misleading comparisons.
4. Propose an ambitious stretch target beyond an incremental improvement. Separate measured facts,
   comparable results, and feasibility hypotheses. Name the cheapest experiment that could test it.

Return the baseline, references, proposed target, tradeoffs, and experiment cost.
Recommend a target for the user to choose; do not replace an agreed target or start optimization.
