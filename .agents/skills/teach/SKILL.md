---
name: teach
description: >-
  Explain a body of work plainly at the reader's pace, combining how it works with evidenced
  reasons for its shape. Use for "teach me this", "help me understand X", or an explanation
  of a change or subsystem; return understanding rather than an implementation plan.
metadata:
  kind: procedure
---

Use the `writing` skill before drafting or revising prose.

# Teach

Explain what a thing is, how it works, and why it is built that way, in one plain account at the
person's pace. The goal is understanding, not changing the software.

Teach sits on top of how (Use the `how` skill) and why (Use the `why` skill).
Blend their findings into
one explanation, lead with what matters to the person, and go deeper when asked.
Reword freely for teaching, except for why's confidence language: its hedges are findings,
not style. Reuse supplied findings; missing rationale is a gap, not permission to invent intent.

1. **Choose what they need to understand.** Read why they are asking and what they already know
   from the conversation, rather than quizzing them. Adjust depth to whether the reader is changing,
   reviewing, debugging, or learning the subsystem. Skip what they plainly already know.
2. **Let how and why do the work.** Read code to orient yourself, then apply the relevant skill.
   For a subsystem, use both; one may suffice for a small question. Independent investigations can
   run in parallel.
   Limit the investigation to the question and relevant sources; reuse existing evidence.
   Distinguish intended Spec contracts from current code; preserve unresolved conflicts.
3. **Start with a plain definition.** Name the thing and what it does, then tie it to this case.
   Explain the problem it solves, then its mechanism, rationale, and relevant edge cases.
   Walk through what happens as the consumer uses it when that makes the mechanism clearer.
   Listing functions and constants is reference, not teaching. Give the smallest complete answer
   first, a sentence or two, then let the reader ask for another layer. For a requested walkthrough
   or a one-shot explanation, give the needed account without forcing additional turns.
4. **Keep it a conversation.** Follow the reader's direction. No quizzes, forced recaps,
   "say it back", announced pauses, or declarations that a part is difficult or important.
   When you would pause, stop and let them respond. Do not turn the explanation into a report
   about which skills or agents ran.
5. **Show when it helps.** Use the relevant code, diff, debugger view, or a small diagram when
   it explains faster than prose. Build a complicated picture in stages rather than presenting
   every moving part at once: first A → B, then add C, then the return edge when relevant.
   Match the medium to the question and available tools. A simple point needs no figure;
   image generation is not required.

Use plain spoken language, concrete mechanisms, and one name per concept. Be tight, not terse;
retain the detail that makes the idea understandable. Do not replace technical qualifications
with a tidier but stronger claim.

**Reply:** the explanation itself, never a report about what you delivered. Lead with the main
point, then the account of what it is, how it works, and what evidence supports its rationale.
Direct invocation does not create Plans, Tasks, or Specs or authorize code changes.
