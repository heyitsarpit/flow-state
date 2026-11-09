---
name: interview
description: >-
  Interview the user to settle the decisions that go into the project's Plan, its Architecture
  Decision Record (ADR). Shows concrete before-and-after proposals, asks a few numbered questions
  per round with a recommendation, and records only settled decisions with their reasons. Use when
  shaping a goal, exploring an idea, or resolving design decisions.
metadata:
  kind: procedure
  applies:
    - principle-design-for-verification
    - policy-records
    - policy-writing
---

# Interview

The goal of the interview is an ADR. The Plan is the project's Architecture Decision Record
(`policy-records`): each settled decision, why it was chosen, what it commits the project to, and
what was rejected. Everything you ask exists to fill that record with decisions a reader can
understand without this conversation.

Talk through what the user wants to achieve. Develop shared understanding of the work being planned.
If the user has not supplied a project goal, open with: "What do you want this project to achieve?"
Otherwise, start from the supplied goal. Name the consumer and their core workflow, including
maintainers when relevant. Judge scope and tradeoffs from their experience, not implementation
convenience. Settle scope and non-goals before proposing mechanisms, including future paths the
project will keep open but not build now; record them as Plan `constraints`.

Help the user define targets that can be verified and the diagnostic tools they need.
Clarify observable outcomes and pass conditions before dependent implementation.
Cover relevant failure and boundary cases for the agreed scope.
Leave missing executable checks explicit as planned work. Use `principle-design-for-verification`.

Read supplied Plans and settled decisions before interviewing. Surface conflicting commitments. Use
`to-plan` to record understanding as it settles, including the verification
strategy as Plan Verification targets.

Map the discussion as a **design tree**: each decision branches into decisions that depend on it.
The **frontier** contains decisions whose prerequisites are settled. Work it in **rounds**.

1. Investigate facts needed by the frontier. Finding facts is your job, not the user's. Pending
   investigation blocks only the questions that depend on it. When a consequential technical choice
   needs stronger methods or evidence, say so and suggest `reimagine-depth`. For difficult technical
   choices inspection cannot settle, offer a `prototype`. Explain what it would answer, estimate the
   time, and recommend whether the evidence is worth the effort. Build it only if the user chooses
   it. Otherwise, keep the uncertainty explicit. Discuss any results before asking dependent
   questions. Keep product preferences with the human.
2. Ask independent frontier questions together: about three per round, never more than five.
   Number them and give your recommended answers. Split a large frontier across rounds. Questions
   that depend on unanswered choices belong to a later round. When the user asks to pause the
   questions, stop asking and work on what they asked for instead.
3. Make each choice concrete before asking it. Show the current behavior and the proposed one as
   a short before-and-after example in the real format (code for an API, a `.plan` object for a
   decision). Say what changes, what the user loses, and what it costs. When a proposal introduces
   new names, say which are reserved by the system and which the author chooses.
4. Ask in chat, end the turn, and wait for answers. Do not use background Q&A tools.
5. Treat everything as a proposal until the user settles it. Do not record a proposal as a decision
   or finalize decisions the user has not made. Unsettled choices stay as Plan questions.
6. Use `to-plan` to record each settled answer as an ADR decision: the choice, why it wins, its
   consequences, and the rejected alternatives the discussion surfaced. For example:

   ```text
   decisions
       D2  Outcome handlers are static data
           Tools can read every action without running user code, which the checker needs.
           Consequence: an action cannot be chosen at runtime. Rejected: callbacks returning
           actions, because they hide structure from tools.
   ```

   Never record the round, the speaker, or "User answer"; record the reason. Record material
   findings too, before the next dependent round. Then recompute the frontier from answers,
   findings, and the updated Plan.

Format each round like this:

```markdown
**Q1 — <Decision title>**
<Question, with alternatives and tradeoffs when useful>

**Answers:**
- A. <Option and its main tradeoff>
- B. <Option and its main tradeoff>

**Recommendation:** <Suggested answer and reason>

**Q2 — <Decision title>**
<Question>

**Answers:**
- A. <Option and its main tradeoff>
- B. <Option and its main tradeoff>

**Recommendation:** <Suggested answer and reason>
```

Omit answer choices for open questions. The user can answer in their own words.
Question numbers label the conversation round. They are not durable Plan IDs and never appear in
the Plan.

When a choice changes code or an API, put the before-and-after example under the question, kept to
about ten lines:

````markdown
**Q1 — Where outcome handlers live**
Today each transition returns its actions from a callback. The proposal makes them static data.

```ts
// before
actions: ({ event }) => [save(event.id)]

// after
actions: [save.with(({ event }) => event.id)]
```

Changes: tools can read the structure without running code. Loses: choosing an action at runtime.

**Answers:**
- A. Static list (proposal). Tooling sees every action.
- B. Keep callbacks. More flexible, opaque to tools.

**Recommendation:** A, because static structure is what the checker needs.
````

Use concrete scenarios to sharpen vague terms and expose hidden assumptions.
Ask the user which outcomes matter and which tradeoffs they accept.

Finish when the planned scope is understood and no consequential assumption remains hidden. Leave
explicitly deferred branches visible. Present any remaining disagreement for resolution. Present
settled intent, remaining questions, and the Plan path and validation result. Ask the user to
approve the Plan before dependent work. Reuse approval of unchanged Plan content. Recommend the next
useful action and stop. A completed Plan does not start Task preparation or coding.
