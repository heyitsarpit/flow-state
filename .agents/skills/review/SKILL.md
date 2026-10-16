---
name: review
description: >-
  Independently review an implemented change against agreed intent, contracts, and documented
  project standards. Use for a branch, diff, or work in progress; return evidenced findings
  and a revision-bound verdict without applying fixes or merging.
disable-model-invocation: true
metadata:
  kind: procedure
---

# Review

Bind the review target, apply both lenses, verify findings, and report a revision-bound verdict.

For consequential specialist questions, use [the lens guide](references/specialist-lenses.md)
to assign focused coverage. Keep the same review packet and lead judgment.
For findings requiring commitment or evidence reconciliation, apply
[keep-intent-aligned](../keep-intent-aligned/SKILL.md): cite the Plan object, Spec contract,
or Task acceptance and report the implication. Review remains read-only.

Review the integrated result, not just worker receipts. Challenge the implementation against
the agreed objective; the human retains objective alignment. No findings is a valid outcome.

Use the harness's delegation tools and configured models. Reviewers work independently of the
implementer and one another; give them the challenge method, the same packet, and the rubric.
For consequential changes, use available model diversity without inventing a model roster.
Use the supplied execution mode. Missing required independent review means BLOCKED.
Reviewers do not edit source or workflow artifacts; isolated checks may produce temporary outputs.

## 1. Fix the review target

- Resolve the comparison base and target revision. For work in progress, include staged, unstaged,
  and relevant untracked changes; capture the reviewed snapshot so later edits are distinguishable.
  Use a supplied base or one established by repository state; ask if materially ambiguous.
- State intent from the request, relevant Plan references, Task acceptance, and Spec guarantees.
  Read actual code alongside those sources. Missing Specs limit contract evidence; do not create
  one merely to review. Surface conflicting requirements rather than choosing silently.
- Supply the diff, relevant surrounding code, existing impact findings, checks and their conditions,
  and documented project standards. Keep discovery bounded to consequential claims.
  Separate assignment write limits from code standards; a forbidden edit is not a forbidden module.

## 2. Challenge through two lenses

Reviewer: read the supplied snapshot/diff, intent, contracts, project standards, and check evidence.
Remain independent of authors and other reviewers. Do not edit source or workflow artifacts;
isolated checks may produce temporary outputs. Apply both lenses and return findings separately:

- **Intent and contracts:** missing or partial outcomes, violated invariants, unintended behavior,
  integration failures, and unsupported acceptance claims. Follow real consumers beyond the diff.
- **Project standards:** cite the documented rule and violating code. Distinguish hard violations
  from design judgments; a preferred style or an invented convention is not a violation.

Trace the execution path behind a suspected bug. Examine root causes, state and resource lifetimes,
shared protocols, failure behavior, and security where relevant; do not force every lens on a small
change. A structural concern needs a concrete consequence, not "I would do it differently."

Apply [testing-policy](../testing-policy/SKILL.md) to the checks. Assess whether evidence exercises
the real claimed boundary at this revision and whether failures can be reproduced and explained.
Passing checks do not settle untested guarantees. Reuse existing impact evidence; apply
[change-impact](../change-impact/SKILL.md) only where consequential downstream questions remain.

Each finding names its lens, code location, requirement or rule, triggering conditions,
consequence, and evidence. Separate demonstrated defects from unverified risks; suggest a bounded
repair only when supported. Do not pad the review with praise, generic advice, or forced findings.

## 3. Apply lead judgment

Lead: read the supplied review packet and all findings. Deduplicate within each lens and retain
both labels when one issue affects both. Remain read-only. Investigate lone findings and
disagreements against sources and real execution where useful; votes are not proof.
Do not discard a credible defect because only one reviewer found it.

Classify findings as **Act on**, **Consider**, or **Dismissed**, with the reason. Act on concrete
defects, binding-rule violations, and missing evidence needed for acceptance. Consider evidenced
tradeoffs; dismiss preferences, impossible paths, and claims contradicted by the actual context.
Do not dismiss a defect merely because it existed before if this change exposes or relies on it.

## 4. Return the review

Lead: report the target and intent, which reviewers covered each lens, and findings under
**Intent and contracts** and **Project standards**. Keep each lens's conclusion visible; success in
one does not cancel failure in the other. Include material dismissals, unresolved disagreements,
checks run, and evidence gaps.

Give a verdict for this snapshot: **changes required**, **no blocking findings**, or
**inconclusive** when evidence cannot settle acceptance.
A clean review is not a merge authorization.

Report repair findings and contract gaps with a recommended next action.
Objective conflicts return to the human.
After repairs, review the changed snapshot and invalidate affected evidence. Retrospective learning
and merging happen downstream.
