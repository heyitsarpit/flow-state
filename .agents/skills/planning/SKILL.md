---
name: planning
description: >-
  Interview the user to develop a shared plan. Use when shaping a project goal,
  exploring an idea, or resolving design decisions through questions.
metadata:
  kind: procedure
---

# Planning

Talk through what the user wants to achieve. Develop shared understanding of the work being planned.
If the user has not supplied a project goal, open with: "What do you want this project to achieve?"
Otherwise, start from the supplied goal.
Name the consumer and their core workflow, including maintainers when relevant.
Judge scope and tradeoffs from their experience, not implementation convenience.

Guide the user to define verifiable targets and diagnostic tools.
Clarify observable outcomes and pass conditions before dependent implementation.
Cover relevant failure and boundary cases for the agreed scope.
Leave missing executable checks explicit as planned work. Use the `design-for-verification` skill.

Read supplied Plans and settled decisions before interviewing. Surface conflicting commitments. Use
the `to-plan` skill to record understanding as it settles, including the verification
strategy as Plan Verification targets.

Map the discussion as a **design tree**: each decision branches into decisions that depend on it.
The **frontier** contains decisions whose prerequisites are settled. Work it in **rounds**.

1. Investigate facts needed by the frontier. Finding facts is your job, not the user's.
   Pending investigation blocks only the questions that depend on it.
   When a consequential technical choice needs stronger methods or evidence, use deepen (Use the
   `deepen` skill) to propose a stronger investigation brief within the agreed scope.
   For difficult technical choices inspection cannot settle, offer a prototype (Use the `prototype`
   skill). Explain what it would answer, estimate the time, and
   recommend whether the evidence is worth the effort. Build it only if the user chooses it.
   Otherwise, keep the uncertainty explicit. Discuss any results before asking dependent questions.
   Keep product preferences with the human.
2. Ask independent frontier questions together. Number them and give your recommended answers.
   Explain material tradeoffs. Keep each round readable; split a large frontier across rounds.
   Questions that depend on unanswered choices belong to a later round.
3. Ask in chat, end the turn, and wait for answers. Do not use background Q&A tools.
4. Use the `to-plan` skill to record material answers and findings before the next
   dependent round.
   Recompute the frontier from answers, findings, and the updated Plan.

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
Question numbers label the conversation round. They are not durable Plan IDs.

Use concrete scenarios to sharpen vague terms and expose hidden assumptions.
Ask the human for objective-level choices and acceptable tradeoffs.

Finish when the planned scope is understood and no consequential assumption remains hidden.
Leave explicitly deferred branches visible. Present any remaining disagreement for resolution.
Present settled intent, remaining questions, and the Plan path and validation result.
Ask the user to approve the Plan before dependent work. Reuse approval of unchanged Plan content.
Recommend the next useful action and stop.
A completed Plan does not start Task preparation or coding.
