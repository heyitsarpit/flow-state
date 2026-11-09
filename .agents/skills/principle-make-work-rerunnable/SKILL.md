---
name: principle-make-work-rerunnable
description: >-
  Make consequential edits, migrations, analyses, or verification rerunnable with a small
  codemod, script, generator, check, or delegate procedure. Use when tooling makes the work
  materially easier to repeat or review; reuse an adequate existing tool first.
metadata:
  kind: principle
  applies:
    - principle-design-for-verification
---

# Build the Lever

When tooling makes non-trivial work checkable or repeatable, build the tool that does it instead
of doing it by hand. Reuse an adequate existing tool before adding one.

**Why:** Codemods, generators, and scripts repeat work consistently and rerun cheaply. Reviewers can
inspect and rerun each tool. A script preserves the transformation itself, so a reviewer can inspect
it and repeat it instead of trusting a description. A deterministic script turns "trust me" into
"run this."

**Pattern:**

- Do the first unit by hand to learn the recipe, then build the tool. Prove it by running it on that
  unit's original input and diffing the result against your hand-done version; then show a rerun is
  safe: run a tool that rewrites its input again on its own output and confirm nothing changes, and
  run an analysis or check twice on the same input and confirm the results match.
- Use a codemod or script for edits, a generator for repetitive files, a dump you can query (for
  example JSON or SQLite) for analysis, or a rerunnable check for verification. Define scope and the
  expected result first.
- If a deterministic tool can process every unit in one pass, use it instead of delegating that
  recipe by hand.
- When delegating, put the recipe, verification contract, and do-not-touch boundaries in one
  procedure all workers can read, and keep it outside every worker's write scope so none of them can
  edit it.
- Return the tool or shared procedure, how to run it, and the evidence it produces. Keep the tool or
  procedure with the work when later agents or reviewers need it.

**Balance:** Build the smallest tool that does or proves the job, never a framework. Build a
one-off tool when it makes the work checkable. Skip new tooling for a few obvious edits or
when its construction and maintenance cost exceed its verification value.

Design targets and evidence in accordance with `principle-design-for-verification`. Respect the
supplied write scope and resource budget; tooling does not authorize a broader migration or
automatic commit.

This principle covers the current job. Preventing a recurring mistake is a separate task; see
`principle-enforce-with-structure`.
