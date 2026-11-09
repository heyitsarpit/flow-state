---
name: explain-why
description: >-
  Find out why existing code or a decision took its current shape, from Plans, Specs, Task
  records, documentation, comments, and Git history. Returns cited reasons, inferences labelled
  as such, and the gaps. For how the code works at runtime, use explain-how.
metadata:
  kind: procedure
  applies:
    - policy-writing
    - principle-claim-only-what-you-checked
---

# Explain Why

This skill finds out why code or a decision took its current shape, from the evidence, and keeps
recorded reasons apart from inference. Code often carries decisions nobody wrote down (a guard for
an incident long fixed, an order a library once required), so say plainly where the evidence runs
out. It returns an answer; it does not start planning or create workflow records.

`explain-how` says what the code does. `explain-why` says what forces gave it that shape. When
Plans, Specs, or history are missing, the answer is limited; never invent a rationale to fill the
gap.

Start with local sources. Consult remote evidence (other repositories, issue trackers, chat) only
when the user asks for it or the evidence you are reading links to it directly; follow [the remote
source guide](references/remote-sources.md), and keep what you find there cited. Investigators only
read; they never change files or anything external. Reuse evidence and findings that `change-impact`
or `explain-how` already produced.

## Pick the job you were given

- **Evidence only.** Read [the investigator guidance](references/investigator-prompt.md) and
  [the local source guide](references/source-playbook.md), apply them to the question, evidence
  anchor, and source angle you were assigned, and return cited evidence and gaps. Stop before
  writing an explanation.
- **Synthesis only.** Read [the synthesis guidance](references/synthesizer-prompt.md) and
  [the confidence guide](references/epistemics.md), work from the findings you were given, and
  spot-check their citations. Return the cited answer and the open gaps; do not restart the
  investigation.
- **The full answer.** Follow the steps below, reusing evidence that is already settled.

Throughout, keep facts apart from inferences, and phrase confidence the way
[the confidence guide](references/epistemics.md) says. Its hedges are part of the answer.

## Steps

1. **Understand the target and the question.** The target is usually a piece of code, a pattern, a
   feature, or a named decision. The question is usually about a design reason, a tradeoff, an edge
   case that motivated something, an outside constraint, dead code, or a broad history sweep. If the
   target is vague ("why do we do it this way?"), make your best guess from context (open files, the
   cursor location, recent edits, what was just discussed), say it in a line so the user can
   redirect you, and carry on.

2. **Anchor the evidence.** Start from the code, record, or decision being questioned, and collect
   the Plan decisions, Spec provenance, Task records, and local notes that touch it, plus file
   paths, line ranges, and key symbols for code, and the relevant commits when history is available.
   For a decision made before any code existed, its record and context are enough to start. Use
   [code archaeology](references/sources/code-archaeology.md) for history methods and [the local
   source guide](references/source-playbook.md) for everything else, and mark history you could not
   get.

3. **Investigate the local evidence.** Answer a narrow question directly. For a broad one, consider
   splitting the work into bounded evidence angles for separate investigators, then combine what
   they find; when you cannot start investigators, work through the angles yourself one at a time.
   Do not force a full investigation when one cited source already answers the question. Look in two
   places:
   - **The recorded reasons:** Plan decisions and constraints, Spec sources and the requirements
     they cite, Task evidence, design notes, comments, and incident records.
   - **The history:** Git blame, the commits that introduced the code, earlier implementations,
     the history of the records, and regression checks. Trace back; the latest commit is rarely the
     whole story.

   A current contract states what the system must guarantee; it explains why only when its
   provenance
records the reason. When sources contradict each other, keep both. Record what you searched and
where evidence is missing. For defensive code, look for the incident behind it with [the incident
guide](references/sources/incident-postmortem.md).

   Each investigator gets the user's question, the evidence anchor, a bounded angle, and
   [the investigator guidance](references/investigator-prompt.md). Investigators return quotes,
   locations, dates, contradictions, and gaps. They do not edit records or decide which
   conflicting requirement wins.

4. **Write the answer** under `policy-writing`. Combine the findings against the anchor and the
   original question using [the synthesis guidance](references/synthesizer-prompt.md) and [the
   confidence guide](references/epistemics.md). Spot-check citations against the sources and keep
   the uncertainty in.

## Watch out for

- **Trusting the latest commit.** The current shape is usually many earlier decisions piled up.
- **A rationale that sounds right.** If no source says it, it is an inference; label it.

## What to return

Use the structure in [the synthesis guidance](references/synthesizer-prompt.md), adapted to the
question but always keeping confidence levels separate. Report the sources you consulted, the
searches that found nothing, and the sources you skipped and why.

If the question comes before a planned change to this code, end with a constraint set for planning
it: what to **Preserve**, what could **Change** (and what that still needs validated), what to
**Avoid**, and the **Risks**.
