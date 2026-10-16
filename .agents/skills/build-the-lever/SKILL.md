---
name: build-the-lever
description: >-
  Make consequential edits, migrations, analyses, or verification rerunnable with a small
  codemod, script, generator, check, or delegate procedure. Use when tooling makes the work
  materially easier to repeat or review; reuse an adequate existing tool first.
disable-model-invocation: true
metadata:
  kind: principle
---

# Build the Lever

When tooling makes non-trivial work checkable or repeatable, build the tool that does it instead
of doing it by hand. Reuse an adequate existing tool before adding one.

**Why:** Codemods, generators, and scripts repeat work consistently and rerun cheaply.
Reviewers can inspect and rerun each tool.
Hand-done changes can only be re-verified by redoing them. A deterministic script turns
"trust me" into "run this."

**Pattern:**

- Do the first unit by hand to learn the recipe, then build the tool. Prove it by rerunning it on
  that unit and diffing against the hand-done version. Make the lever safe to rerun.
- Use a codemod or script for edits, a generator for repetitive files, a queryable dump for
  analysis, or a rerunnable check for verification. Define scope and the expected result first.
- If a deterministic tool can process every unit in one pass, use it instead of delegating that
  recipe by hand.
- When delegating, put the recipe, verification contract, and do-not-touch boundaries in one
  procedure all workers can read. Keep it outside their write scope.
- Applying this principle produces or reuses a concrete tool or procedure. State how to run it and
  what evidence it produces. Keep the tool or procedure with the work when later agents or reviewers
  need it.

**Balance:** Build the smallest tool that does or proves the job, never a framework. Build a
one-off tool when it makes the work checkable. Skip new tooling for a few obvious edits or
when its construction and maintenance cost exceed its verification value.

Design targets and evidence in accordance with
[design-for-verification](../design-for-verification/SKILL.md). Respect the supplied write scope
and resource budget; tooling does not authorize a broader migration or automatic commit.

This principle makes the current work rerunnable. Structural enforcement of a recurring mistake
is a separate responsibility.
