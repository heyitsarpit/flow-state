---
name: principle-enforce-with-structure
description: >-
  Turn recurring corrections into structural enforcement instead of repeated instructions.
  Apply when the same mistake or rule keeps returning; prove a representation, type, check,
  metadata setting, or canonical boundary rejects the demonstrated mistake.
metadata:
  kind: principle
  applies:
    - policy-records
---

# Encode Lessons in Structure

Replace repeated instructions with structural enforcement. Prefer removing the failure path;
otherwise use types, checks, or tests. Keep prose for judgments the mechanism cannot enforce. Decide
whether a correction is a one-off or a pattern before generalizing it. A mistake seen once is
usually a one-off; a mistake seen again, or one whose cause would keep producing it, is a pattern.

**Why:** Textual instructions require the reader to notice, remember, and comply. Structural
mechanisms enforce a rule without relying on that cooperation.

## Pattern

When the same mistake comes up again (often you notice because you are writing the same instruction
a second time):

1. Identify the demonstrated mistake and the requirement it violates. Check whether the lesson
   is general or depends on this scope, boundary, or environment.
2. Ask whether a representation, type, static check, metadata flag, runtime check, or canonical
   boundary can enforce it. Pick the strongest applicable mechanism with the least incidental work.
3. Prove the mechanism rejects a real past mistake and accepts valid behavior. A rule that fires
   on correct code is not reliable enforcement.
4. Remove redundant instructions only after enforcement covers their obligation. Keep rationale,
   necessary exceptions, and judgments the mechanism cannot decide.
5. If enforcement requires judgment, keep concise guidance and a concrete failure example.

Agents copy the surrounding code. An unrepresentable state is stronger than a warning to avoid
it; one authoritative copy of shared data, with the others derived from it, removes a rule about
keeping copies in sync. Choose by what the mechanism
actually establishes, not by the tool's name.

## Close the loop

When stronger enforcement changes a recorded mechanism or exposes a missing rule, apply
`policy-records`: name the owning requirement, retain the correction and enforcement evidence in the
Task. Reusable skill guidance goes through reflect rather than becoming a project rule
automatically.

- Return the correction, violated requirement, proposed mechanism, and evidence that the mechanism
  rejects the demonstrated mistake and still accepts valid work. Name the existing authority or
  expose that it is missing.
- Apply enforcement within agreed scope or record bounded work to build it. A recurring failure
  does not authorize repository-wide policy changes or a rewrite of existing tests.
- Keep enforcement tied to the agreed rule; changing the mechanism does not change its authority.

Do not stop at acknowledging a correction, or at recording it without routing it to its owner, and
do not repair one instance while a demonstrated recurring pattern goes unexplained.
This principle prevents future mistakes; rerunnable tooling for the current job is a separate need.

To find and fix the mistakes agents keep repeating in a repository, follow
[recurring defects](references/recurring-defects.md).
