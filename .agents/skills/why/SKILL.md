---
name: why
description: >-
  Investigate why existing software or a decision took its current shape using Plans,
  Specs, Task records, documentation, comments, and Git history. Return cited rationale,
  inferences, and gaps. Use how for runtime behavior.
metadata:
  kind: procedure
---

# Why

Investigate the motivation and intent behind code or decisions using development evidence.
Start with local sources. For requested or directly linked connected evidence, use
[the remote source guide](references/remote-sources.md) and retain cited findings.
Direct invocation returns an answer without entering planning or creating workflow artifacts.
Missing Plans, Specs, or history limit the answer; do not invent the rationale.

Companion to the `how` skill. `how` answers what the code does and how it works. `why` answers what
forces led to its shape.

Investigators read assigned sources without modifying files or external state. Reuse evidence
anchors and findings supplied by change-impact or how.

## Select the assigned work

- **Evidence only:** read [investigator guidance](references/investigator-prompt.md) and
  [the local source guide](references/source-playbook.md). Apply them to the assigned question,
  evidence anchor, and source angle. Reuse supplied findings; return cited evidence and gaps.
  Stop before synthesis or a final explanation.
- **Synthesis only:** use the `writing` skill when drafting the answer.
  Read [synthesis guidance](references/synthesizer-prompt.md) and
  [confidence guidance](references/epistemics.md). Use supplied findings and spot-check citations.
  Return the cited answer and unresolved gaps; do not restart source investigation.
- **Full answer:** follow the procedure below, reusing settled evidence.

## Operating Posture

Distinguish facts from inferences. Apply `references/epistemics.md` for confidence and phrasing;
the synthesizer must follow it.

## Step 1. Understand the Target and the Question

Parse what the user is asking. The **target** is usually a chunk of code, a pattern, a feature, or a
named design decision. The **question** is usually a design rationale, a tradeoff, a motivating edge
case, an external constraint, dead code, or a broad history sweep.

If the target is vague ("why do we do it this way?" with no clear referent), make your best guess
from conversation context (open files, recent edits, cursor location, what was just discussed).
State your interpretation briefly so the user can redirect if you're off, then proceed.

## Step 2. Establish the Evidence Anchor

Start from the decision, artifact, or code being questioned. Collect:

- Relevant Plan decisions, Spec provenance, Task records, and local notes
- File paths and line ranges; key symbols for code questions
- Relevant commits when history is available

For a decision made before implementation, its reference and context are enough to start.
Use [code archaeology](references/sources/code-archaeology.md) for history methods.

Capture file paths, symbols, commits, and artifact references as seed context.
Mark unavailable history explicitly; use [the local source guide](references/source-playbook.md).

## Step 3. Investigate Local Evidence

For a narrow question, investigate and answer directly. For a broad question, consider dividing
bounded local evidence angles among investigators, then synthesize their findings.
Reuse supplied findings; do not force a full investigation when a cited source answers the question.

- **Recorded rationale:** Plan decisions and constraints, Spec source/basis and referenced
  requirements, Task evidence, local design notes, comments, and incident records when present.
- **Historical lineage:** Git blame, introducing commits, earlier implementations, artifact
  history, and regression checks. Trace back rather than treating the latest commit as
  authoritative.

Current contracts establish commitments, not historical intent without supporting provenance.
If sources contradict, preserve both. Record what was searched and where evidence is missing.
For defensive code, use `references/sources/incident-postmortem.md` to look for local incident
history.

Each investigator gets the user's question, evidence anchor, bounded evidence angle, and
`references/investigator-prompt.md`. Use the local guide for its assigned source.
Investigators return quotes, source locations, dates, contradictions, and gaps; they do not edit
artifacts or decide which conflicting requirement wins.

## Step 4. Synthesize

Use the `writing` skill when drafting the final explanation.
Synthesize the findings against the evidence anchor and original question using
`references/epistemics.md` and `references/synthesizer-prompt.md`.
Spot-check citations against sources; preserve uncertainty.

## Step 5. Present

Present cited findings and confidence analysis. Preserve confidence language.

## Output Format

Use the structure in `references/synthesizer-prompt.md`. Adapt sections to the question while
preserving confidence separation.
Report consulted sources, searches that found nothing, and skipped sources with reasons.

If the user's `why` question precedes changing this code, convert the lineage findings into a
Preserve / Change / Avoid / Risk constraint set
suitable for planning the change.

## Common Failure Modes to Avoid

- **Recency bias**. Assuming the most recent commit is authoritative. The current shape is often the
  accretion of many earlier decisions. Trace back.

## Reference Files

- `references/epistemics.md`. Confidence tiers and phrasing guide. The synthesizer must follow it.
- `references/investigator-prompt.md`. Base prompt template for investigator subagents.
- `references/source-playbook.md`. Index pointing at the category playbooks below.
- `references/sources/code-archaeology.md`. Local Git and workflow-artifact investigation.
- `references/sources/incident-postmortem.md`. Local incident leads for defensive code.
- `references/synthesizer-prompt.md`. Prompt template for the synthesizer subagent, including the
  output format.
