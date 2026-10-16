
# Correct recurring project mistakes

Find the mistakes agents repeat in this repository. Change the repo so the wrong path is removed or
caught. Prove the enforcement rejects a past mistake and accepts valid behavior.

## 1. Find the mistake classes

Read recent corrections, commits, reverts, reviews, Task evidence, agent instructions, and
workaround comments. Group mistakes by the mechanism that caused them. A class is recurring after
two demonstrated occurrences; one incident remains a candidate. Prioritize frequency and
consequence. Name the requirement each class violates, its authority, and the allowed repair scope.

## 2. Fix each class at the highest level that works

Use [encode-lessons-in-structure](../../encode-lessons-in-structure/SKILL.md) to select enforcement.
Try removing the failure path at its owning boundary first. Otherwise use types or checks to reject
it; keep guidance for judgments a mechanism cannot enforce. Inspect duplicate owners, hand-synced
lists, and obsolete paths a future agent might copy.

Use [to-spec](../../to-spec/SKILL.md) for changed behavioral contracts and
[execute-task](../../execute-task/SKILL.md) for bounded implementation. Apply
[keep-intent-aligned](../../keep-intent-aligned/SKILL.md) when a proposed rule changes recorded
intent. If repeated fixes share a failed premise, use
[attack-the-premise](../../attack-the-premise/SKILL.md).

## 3. Fix and prove

Prove the mechanism rejects a representative past mistake and preserves legitimate behavior. Apply
[testing-policy](../../testing-policy/SKILL.md) to regression checks. Compare local and CI
invocation where applicable. A spelling ban or suppression does not prove enforcement. An exception
must preserve the rule or return to its authority.

Keep the requirement, mechanism, rationale, exceptions, and proof in the owning Spec or Task. Link
substantial reports in workflow/reference/ or existing locations. Remove redundant instructions only
after enforcement covers their obligation. Reusable skill lessons belong to
[reflect](../../reflect/SKILL.md).

## Output

Return each class, its evidence, selected enforcement, why stronger options did not work, checks,
and limits. Unreliable enforcement needs bounded follow-up, not an impossibility claim. Recurrence
does not authorize commits, broad policy changes, test deletion, or changed objectives.
