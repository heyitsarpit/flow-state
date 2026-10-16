---
name: arena
description: >-
  Spawn parallel candidates for the same task, pick a base, incorporate the strongest ideas,
  and verify the combined result. Use when the user requests candidate comparison or one attempt
  risks committing to the wrong design.
disable-model-invocation: true
metadata:
  kind: procedure
---

# Arena

Compare N independent candidates for the same bounded task.
Give the judge [its method](#2-judge) and the integrator [its method](#3-integrate).
Supply both with the rubric and all candidates. Withhold judge findings from the integrator until
its own scorecard is complete.
Give candidates the task brief and separate output locations.

## 1. Frame and dispatch

Define one prompt and 3–6 gradeable criteria from the agreed requirements.
Keep the rubric with the judge/integrator; candidates receive all binding requirements.
Use actual worker tools and configured models to dispatch independent candidates.
Candidates return artifacts, checks, assumptions, and rejected alternatives. Retain failed/missing
attempts. Fewer than two completed candidates means no completed comparison.

## 2. Judge

Judge: read the supplied rubric and every candidate end to end. Score each criterion and recommend
a base with evidence. Remain read-only. Prefer cleaner boundaries or a smaller
API when otherwise comparable. Use maintainability and invariant preservation to resolve ties.

## 3. Integrate

Integrator: read every supplied candidate end to end. Score each candidate against every criterion
before receiving the judge's findings. Compare scores and resolve disagreements against artifacts
and evidence before selecting the base. Select ideas worth
porting, usually one or two per other candidate, and graft them into that base. Read each source
again before porting; keep one coherent design.
Record sources, adopted ideas, and rejections. Preserve the base when candidates offer no better
idea. Return incompatible requirements to framing; disagreements about a base go to the judge.
Report consequential contract gaps without silently changing the requirements.

## 4. Check and return

An independent checker runs required checks on the combined artifact against the brief and rubric.
Return PASS, ISSUES, or BLOCKED with revision, conditions, and evidence. Route wrong requirements
upstream, missed ideas to integration, and defects to their author. Recheck affected gates.
Preserve material selection and proof; apply
[keep-intent-aligned](../keep-intent-aligned/SKILL.md) for authorized record updates.
Return combined artifact, judge scores, base rationale, graft sources, rejections, dropouts, and
proof.
