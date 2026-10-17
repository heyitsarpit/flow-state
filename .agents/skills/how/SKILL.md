---
name: how
description: >-
  Explain how existing software works: architecture, runtime flow, protocols, and current
  ownership. Use for "how does X work" or a code walkthrough. Use why for motivation;
  change-impact investigates where a requested change belongs, reuse, and downstream safety.
metadata:
  kind: procedure
---

# How

Explain how existing software works. Trace architecture and runtime flow to build a mental model
for a senior engineer joining the subsystem. Skip line-by-line source narration.
Direct invocation returns an explanation; it does not start planning or create workflow artifacts.

Agents inspect code without modifying it.
Reuse supplied findings and relevant Specs. Specs describe intended contracts; trace current code
and distinguish source inspection from executed behavior. Expose disagreements and uncertainty.
Missing Specs do not block an explanation. Use why for historical motivation.
For an assigned investigation angle, read [explorer guidance](references/explorer-prompt.md).
Apply it to the supplied question and angle. Return evidence and gaps without entering the
complexity procedure below, spawning explorers, or synthesizing an explanation.
Human-facing synthesis is needed only when an explanation is requested; do not restart a
whole-subsystem investigation.
Use the `writing` skill when drafting the requested explanation; skip it for evidence-only work.

## Step 1. Assess Complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (a single module, a small utility, a narrow question such as "how does function X
  work"): explore and explain in a single pass. Go to Step 2b.
- **Complex** (a subsystem spanning multiple files or services, a cross-cutting feature, a full
  architectural overview): use Step 2a for parallel exploration or Step 2b for serial exploration.
  If supplied findings already cover the question, go to Step 3.

When in doubt, take the simple path.

## Step 2a. Explore (complex questions only)

Decompose the question into 2 to 4 exploration angles, each a distinct slice of the subsystem. Spawn
all explorers in a single message:

Each explorer owns one angle and returns source locations, runtime flow, and unresolved gaps.

Each explorer gets the prompt in `references/explorer-prompt.md` with its angle filled in. Then go
to Step 3.

## Step 2b. Direct Explain (simple or serial questions)

Combine exploration and explanation using `references/explainer-prompt.md`.
For bounded internal findings, return relevant facts and stop.
Otherwise go to Step 4.

## Step 3. Synthesize (complex questions only)

For a requested explanation, synthesize every explorer's findings using
`references/explainer-prompt.md`.
For bounded internal findings, return them without a full explanation.

## Step 4. Present

Present the explanation with light edits for clarity or context.

## Output Format

The explanation uses the sections defined in `references/explainer-prompt.md`, dropping any that do
not apply: Overview, Key Concepts, How It Works, Where Things Live, Gotchas.
