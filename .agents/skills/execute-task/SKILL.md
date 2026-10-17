---
name: execute-task
description: >-
  Deliver one bounded workflow Task as mergeable code with acceptance evidence.
  Use for features, behavior-preserving refactors, integration changes, and repairs.
  Continue checks and repairs within the authorized Task or Task set.
metadata:
  kind: procedure
---

# Execute Task

Deliver the authorized Task or Task set through implementation, checks, repairs, integration, and
records. Use implementation guidance (Use the `implement-task` skill) and acceptance
checks (Use the `check-task` skill) where needed.

## 1. Establish readiness

Match the request to a Task and its relevant Plan/Spec commitments.
Read relevant Plan Verification targets and Spec Invariants before implementation.
Inspect Task blockers and current Git/base/dirty state. Resolve required prerequisites and account
for existing work before implementation; a matching Task alone is not ready work.
If none matches, report the missing scope; never substitute unrelated ready work. Use change-impact
(Use the `change-impact` skill) for unresolved boundaries.

For small impact with unchanged contracts and settled assumptions, reuse design and proceed.
Otherwise surface behavioral gaps before affected code. Do not silently change agreed guarantees.
Use the `to-design` skill for implementation-shape decisions when needed.
A bounded unchanged-contract slice can assign design assessment and implementation to one author.
Resolve objective conflicts with the user; continue unaffected authorized work.

## 2. Implement to a mergeable state

Implement against the matching Task, current contracts, cause/repro findings, write paths, exact
base, and checks. Apply implementation guidance (Use the `implement-task` skill) and the
installed lint reference (Use the `workflow-configuration` skill). Integrate consumers
within scope.
One writer owns each shared artifact or Git topology operation.
Build and run assigned checks; exercise a narrow complete path early.
After two failed repairs under one premise, use
attack-the-premise (Use the `attack-the-premise` skill) before another patch.

## 3. Check and record

Assign Task acceptance checking (Use the `check-task` skill), reusing current scoped
evidence.
Keep required checking independent of the implementer.
Repair product defects and missing assigned tests; surface contract gaps and objective conflicts.
Preserve acceptance when repairing findings.
When a defect escapes existing checks, strengthen affected checks before reusing their evidence.
Keep repairs within authorized scope and preserve agreed guarantees.
Repeat affected checks after repairs. Changed patches, bases, or dependencies invalidate affected
verdicts; obtain results for the final snapshot.
Refresh affected Plan procedures through to-plan (Use the `to-plan` skill) within write
scope;
otherwise report the needed edit and location.

Store findings, snapshot, commands, conditions, verdict, and status in the Task's supported fields.
For each changed workflow artifact, run `workflow format PATH --write`.
Replace `PATH` with that artifact's actual path. Run `workflow check` and review the diff.
Mark done only when all required Task gates pass. If the Task's acceptance still needs integration
or review, keep completion pending until those gates pass. Use the `keep-intent-aligned` skill for
material commitment/evidence
changes.
Return patch, snapshot, checked acceptance, record locations, and remaining work.
Continue required review, repair, integration, and verification within the authorized execution
scope without routine confirmation. Stop at completion, a limit, a hold, or a genuine user decision.
Return unresolved gates honestly. Publication, merging, and deployment need their own authority.
