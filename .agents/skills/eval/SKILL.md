---
name: eval
description: >-
  Evaluate skill or prompt changes through realistic blinded agent trials and observable outcomes.
  Use before promoting a variant or comparing agent behavior. Arena produces synthesized artifacts;
  eval returns evidence and a recommendation about the guidance under test.
metadata:
  kind: procedure
---

# Evaluate agent behavior

Run blinded trials with bounded prompts and separate judging/checking methods below.
Return a recommendation; do not automatically promote guidance.

## 1. Design the experiment

### Experiment design method

Designer: use the agreed target and run limits to define variants, realistic tasks, counts, models,
conditions, and 3–6 gradeable criteria with executable outcome checks. Apply design-for-verification
(Use the `design-for-verification` skill). Record revisions and run identities.
Keep binding requirements in ordinary task prompts; keep answer keys and scoring criteria private.
Return the run design, private rubric, prompts, revisions, and remaining prerequisites.

### Establish isolation

The setup/isolation owner confirms actual access boundaries. Separate folders alone are not
security isolation. Return unavailable privacy as an explicit blinding limit before trials.
Candidates receive ordinary project names, raw task/context, permitted actions, and stop boundaries.
Exclude variant labels, other candidates, suspected defects, scoring keys, and evaluation framing.

## 2. Dispatch and retain

Dispatch only the declared trials within the agreed run limits.
Trial operators retain artifacts, actual checks, scoped activity, failures, and conditions.
Keep failed, blocked, and missing runs. Instruction-following claims need actual activity evidence;
do not infer reads from self-report or search unrelated chats.

## 3. Judge and check

Assign independent judging and outcome checking; reuse one independent worker when adequate.
Supply neutral labels and private rubric; withhold model/variant identity without removing evidence.
Use configured model diversity when available; disclose limits.

### Judge method

Judge: remain independent of trial authors. Score supplied outputs against each private rubric
criterion.
Do not edit outputs or expectations.
Return criterion scores, evidence, and unresolved claims.

### Outcome check method

Checker: remain independent of trial authors. Do not edit outputs or expectations; use owned
temporary outputs for checks. Read every output end to end, rerun supplied checks, and inspect
decisive activity. Resolve disagreements against artifacts with the judge. Distinguish product
quality from
following the intended method. Assess claimed differences through explain-the-number
(Use the `explain-the-number` skill). Return claim verdicts, run identities, conditions,
decisive evidence, and missing checks.

## 4. Report

### Synthesis method

Analyst: read the run design, all verdicts, and evidence. Return adopt, revise, retain, or
inconclusive with variants, criteria, counts, conditions, failures, evidence, and limits.
One successful case proves only that case.

### Preserve the evidence

Recommend the next action without promoting guidance automatically. Apply keep-intent-aligned (Use
the `keep-intent-aligned` skill) for authorized record updates.
Preserve evidence before cleaning up owned resources. Create no competing experiment ledger.
