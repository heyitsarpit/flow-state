---
name: explain-how
description: >-
  Explain how existing software works: architecture, runtime flow, protocols, and ownership, as a
  one-shot explanation or paced teaching at the reader's speed. Use for "how does X work", "teach
  me this", or a code walkthrough. For reasons behind a decision, use explain-why.
metadata:
  kind: procedure
  applies: [policy-writing, principle-claim-only-what-you-checked]
---

# Explain How

Explain how existing software works. Trace architecture and runtime flow to build a mental model
for a senior engineer joining the subsystem. Skip line-by-line source narration.
You return an explanation; you do not start planning, create workflow records, or change code.

Inspect code without modifying it. Reuse supplied findings and relevant Specs. Specs describe
intended contracts; trace current code, and distinguish source inspection from executed behavior.
Expose disagreements and uncertainty. Missing Specs do not block an explanation.

For an assigned investigation angle, read [explorer guidance](references/explorer-prompt.md),
apply it to the supplied question and angle, and return evidence and gaps without spawning
explorers or synthesizing an explanation. Apply `policy-writing` when drafting an explanation;
skip it for evidence-only work.

## 1. Assess complexity

If the scope is ambiguous, state your interpretation and explore. The user can redirect.

- **Simple** (one module, a small utility, a narrow question such as "how does function X work"):
  explore and explain in one pass. Go to step 2b.
- **Complex** (a subsystem across files or services, a cross-cutting feature, an architectural
  overview): use step 2a when separate slices can be explored independently and the harness can run
  explorers in parallel; otherwise trace the whole flow yourself with 2b.
  If supplied findings already cover the question, go to step 3.

When in doubt, take the simple path.

## 2a. Explore (complex questions)

Split the question into 2 to 4 exploration angles, each a distinct slice of the subsystem. Spawn
all explorers in one message. Each gets [the explorer prompt](references/explorer-prompt.md) with
its angle filled in and returns source locations, runtime flow, and unresolved gaps. Go to step 3.

## 2b. Explore and explain (simple or serial questions)

Combine exploration and explanation using [the explainer prompt](references/explainer-prompt.md). If
your findings are only input for another agent, return the relevant facts and stop. Otherwise go to
step 4.

## 3. Synthesize (complex questions)

For a requested explanation, synthesize every explorer's findings using
[the explainer prompt](references/explainer-prompt.md). For bounded internal findings, return them
without a full explanation.

## 4. Present

Use the explainer's sections, dropping any that do not apply: Overview, Key Concepts,
How It Works, Where Things Live, Gotchas.

## Teaching mode

Use when the person wants to understand at their own pace ("teach me", "help me understand").
Use the same investigation, but deliver it at the reader's pace.

1. **Choose what they need.** Read why they are asking and what they already know from the
   conversation, rather than quizzing them. Adjust depth to whether they are changing, reviewing,
   debugging, or learning the subsystem. Skip what they plainly know.
2. **Start with a plain definition.** Name the thing and what it does, then tie it to this case.
   Explain the problem it solves, then its mechanism and relevant edge cases. Walk through what
   happens as a consumer uses it when that makes the mechanism clearer. Listing functions and
   constants is reference, not teaching.
3. **Smallest complete answer first.** A sentence or two, then let the reader ask for another
   layer. For a requested walkthrough or one-shot explanation, give the needed account without
   forcing extra turns.
4. **Keep it a conversation.** Follow the reader's direction. No quizzes, forced recaps,
   "say it back", announced pauses, or declarations that a part is difficult or important.
   When you would pause, stop and let them respond. Do not report which skills or agents ran.
5. **Show when it helps.** Use the relevant code, diff, debugger view, or a small diagram when it
   explains faster than prose. Build a complicated picture in stages: first A → B, then add C, then
   the return edge. A simple point needs no figure. Match the medium to the question and the tools
   available; image generation is never required.
6. **Blend in reasons when supplied.** When `explain-why` findings are available, weave them in,
   but keep their confidence language: those hedges are findings, not style. Missing rationale is
   a gap, not permission to invent intent.

Never replace a technical qualification with a tidier but stronger claim.

**Reply:** the explanation itself, never a report about what you delivered. Lead with the main
point.
