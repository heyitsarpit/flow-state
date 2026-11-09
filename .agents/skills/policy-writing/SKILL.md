---
name: policy-writing
description: >-
  The writing standard for workflow records, skills, and agent instructions: record the result,
  not the session; lead with the point; show concrete examples; keep tables narrow and lines
  under 100 characters. Use whenever drafting or revising prose. Does not define record schemas
  or CLI operations.
metadata:
  kind: policy
---

# Writing

Write so a reader understands the point and can act on it on the first read, months later, without
the conversation that produced it. Keep the content explicit, simple, and short.

## Record the result, not the session

A record (Plan, Spec, Task, reference) describes the current truth. The conversation that produced
it is gone when the session ends.

- State the decision, fact, or requirement directly. Leave out who said it, which round it came
  from, and the order things were discussed.
- Never write session residue: "User answer, round 3.", "as discussed", "per your request",
  "we decided earlier", "after the review", "under discussion".
- Write the reason, not the provenance. "Chosen because X" survives; "the user preferred it" does
  not explain anything to the next reader.
- When something is unsettled, say so in the record's own terms: an open question, or a proposal
  marked as one. Do not describe the record as a working log.
- If a sentence adds nothing a future reader needs, delete it.

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
| Rubric | Derive concrete criteria; compare | 3–6 gradeable criteria; score each |

## Show, then explain

- Prefer one concrete example to several abstract rules. When a skill produces a record or code,
  show the example in the real format.
- When proposing a change to code or an API, show before and after, side by side or in sequence.
- Keep examples short (about ten lines) and in the native format of the record: a real `.plan`
  object, a real `.spec` invariant, real code. Never invent a format for an example.
- Introduce a new term only when an existing one will not do. Define it on first use, and say
  which names are reserved by the system and which the author chooses.
- An example that only makes sense with one conversation's context does not belong in a skill or
  record; an example a new reader can follow on its own does, wherever it came from.

## Make the structure useful

- Choose the purpose: tutorial for guided learning, how-to for a task, reference for lookup,
  or explanation for understanding. Separate and link material that serves a different purpose.
- Use bullets for parallel facts. Number ordered steps.
- Give each paragraph one topic and at most four sentences. Connect related sentences clearly.
- Use descriptive headings. State each fact once; link to its authoritative source instead of
  repeating it.
- Add notes, resources, examples, and prior art when they explain a choice.

## Tables

- Use a table to compare short values across the same few attributes. Keep it to about four
  columns, with cells of a few words.
- When any cell needs a sentence, use a list or headed sections instead.
- Table rows are exempt from the 100-character line limit: a row cannot wrap without breaking
  the table. The exemption is not a license for long cells; if a row only fits by holding
  sentences, the content wants to be a list.

## Use precise language

- Use plain words and one name per thing. Preserve actual symbols and technical terms.
- Remove filler, praise, rhetorical contrasts, and decorative formatting.
- Keep subjects, articles, and verbs. Break long noun strings with prepositions.
- Replace a pronoun with the noun when its meaning is unclear.
- Support claims with sources or observations. Never invent evidence.
- Keep qualifications that affect meaning. Do not turn a proposal into a proven result.

## Writing a skill

Write a skill the way a senior colleague briefs a capable teammate who is new to the project: second
person, plain words, full sentences, calm and direct. Write connected sentences so the reader can
follow the method without reconstructing it.

- **Start with what the skill is for:** the job, when to use it, and, when it matters, when not to.
- **Give the reason for any rule that is not obvious.** One clause is enough. A rule with its
  reason gets applied sensibly; a bare rule gets followed literally or skipped.
- **Let sentences connect.** "Then", "so", "because", and "otherwise" turn a list of commands into
  a method someone can follow.
- **Name things the way a person would.** "The checks that passed", not "passing evidence"; "run
  it again on the final code", not "obtain results for the final snapshot".

- **Say each rule once.** Rules that apply everywhere live in their principle or policy and are
  listed under `metadata.applies`; do not restate them.
- **End with what to return and where to stop.**

Organize a skill around its purpose, steps, and what it returns. A typical shape: "Before you start"
when something must be read or checked first; numbered steps, each a bold lead-in and a short
paragraph; one example; "Watch out for" with the mistakes people actually make; "What to return". A
short skill can be three paragraphs. Longer text that reads at once beats shorter text that has to
be decoded.

## Before and after

**Session residue in a Plan decision.**

```text
before:
    D4  Retry limit applies per account
        User answer, round 2.

after:
    D4  Retry limit applies per account
        A per-request limit lets one client bypass it by opening more requests; a per-account
        limit bounds total load from one customer. Consequence: the limit needs a shared
        counter keyed by account. Rejected: per-request limits, for the bypass above.
```

**Compressed instruction.**

```text
before: Record shared decisions once at their owner. Other Plans cite that owner and record
        local implications. Return uncertainty changing scope to the user.

after:  If a decision affects several Plans, write it once, in the Plan that owns it. Other Plans
        link to it (@plan.Other.D3) and note only what it means for them. If you are unsure
        whether a change alters scope, ask before writing.
```

**A table that wants to be a list.**

```text
before:
| #  | Goal      | In one line                                                                 |
|----|-----------|-----------------------------------------------------------------------------|
| G2 | Validity  | a settled change repairs every answer it could affect, including answers... |

after:
- **G2 Validity after change.** A settled change repairs every answer it could affect,
  including answers that do not contain the record yet.
```

## Check the draft

- Keep authored Markdown source lines at most 100 characters, including indentation. Table rows
  and literals that cannot wrap safely (long URLs, code, identifiers) are the exceptions.
- Preserve literal code, URLs, identifiers, and quotations when wrapping would alter them.
- Preserve meaning when splitting sentences. Exempt literal code and quotations from word limits.
- Check that pronouns, conditions, and obligations have one clear interpretation.
- Search the draft for session residue and delete it.
- Remove repetition. Read the result for meaning, not only compliance with these rules.

## Edit existing text

- For small changes, update only the affected passages. Preserve unrelated wording and structure.
- Rewrite a larger section only when the requested change requires it.
- Integrate a new rule into the section it belongs to; do not append detached paragraphs.
