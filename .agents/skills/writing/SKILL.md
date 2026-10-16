---
name: writing
description: >-
  Write or revise technical prose for workflow documents, skills, and agent instructions.
  Use for writing style and clarity. Does not define artifact schemas or CLI operations.
disable-model-invocation: true
metadata:
  kind: policy
---

# Writing

Write so a reader can understand the point and act on it on the first read.
Keep the content explicit, simple and short.

## Lead with a point

- Put the fact, requirement, decision, or action first.
- Name the actor and use concrete verbs. Prefer active voice.
- Give each sentence one main idea. Use at most 25 words in descriptive sentences.
- Write instructions as direct commands. Use one action and at most 20 words per sentence.
- Put a condition before the instruction it limits.
- Preserve uncertainty. Distinguish facts, assumptions, proposals, and decisions.

## Make the work explicit

- Say exactly what to do, how much to cover, and what to return.
- State how to judge the result. Keep limits beside the actions they constrain.
- When adapting a source, preserve its steps and obligations. Shorten repetition, not the method.

| Detail | Vague | Explicit |
|---|---|---|
| Action | Compare independent candidates | Spawn N parallel candidates |
| Reading | Read every candidate | Read every candidate end to end |
| Rubric | Derive concrete criteria; compare | 3–6 gradeable criteria; score each criterion |

## Make the structure useful

- Choose the purpose: tutorial for guided learning, how-to for a task, reference for lookup,
  or explanation for understanding. Separate and link material that serves a different purpose.
- Use bullets for parallel facts. Number ordered steps.
- Give each paragraph one topic and at most four sentences. Connect related sentences clearly.
- Use descriptive headings and tables for comparisons. Keep table cells short.
- State each fact once. Link to its authoritative source instead of repeating it.
- Add notes, resources, examples, and prior art when they explain a choice.

## Use precise language

- Use plain words and one name per thing. Preserve actual symbols and technical terms.
- Remove filler, praise, rhetorical contrasts, and decorative formatting.
- Keep subjects, articles, and verbs. Break long noun strings with prepositions.
- Replace a pronoun with the noun when its meaning is unclear.
- Support claims with sources or observations. Never invent evidence.
- Keep qualifications that affect meaning. Do not turn a proposal into a proven result.

## Check the draft

- Keep authored Markdown source lines at most 100 characters, including indentation.
- Preserve literal code, URLs, identifiers, and quotations when wrapping would alter them.
- Preserve meaning when splitting sentences. Exempt literal code and quotations from word limits.
- Check that pronouns, conditions, and obligations have one clear interpretation.
- Remove repetition. Read the result for meaning, not only compliance with these rules.

## Edit existing text

- For small changes, update only the affected passages. Preserve unrelated wording and structure.
- Rewrite a larger section only when the requested change requires it.
