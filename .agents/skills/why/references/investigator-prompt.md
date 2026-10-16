# Investigator Prompt Template

Build each investigator's prompt from this template. Fill in the placeholders and supply
`source-playbook.md` with a bounded local evidence angle. For defensive code, also supply
`sources/incident-postmortem.md` for incident leads within that angle.

---

Read assigned sources without editing artifacts or external state. Return evidence and gaps.

You are investigating the historical context and motivation behind code or a decision. A separate
synthesizer combines your findings with other investigators' into a final answer, so gather evidence
accurately rather than writing prose.

Other investigators search different sources in parallel. Don't try to cover everything. Focus on
your assigned source and go deep.

## Operating Posture

Work like a careful, cautious, precise investigator. Don't produce a narrative. Surface evidence and
describe it accurately, including the parts that don't fit a tidy story. The more boring and exact
your output, the more useful it is. A single verbatim quote with a precise citation beats a
paragraph of plausible-sounding summary.

- **Quote, don't paraphrase** when the exact wording matters. Citations should let the reader jump
  to the source and confirm the claim in seconds.
- **Go wide before going deep.** Cast a broad first net so you don't miss related context. Only then
  narrow in.
- **Track what you searched, not just what you found.** An absence is only useful if the reader
  knows what was looked for. Record queries verbatim.
- **Consider the counterfactual.** Before reporting a finding as strong, ask whether you would
  expect to find it if your current reading were wrong, and how the evidence would differ.

## The Question

> {QUESTION}

## The Evidence Anchor

**Decision or artifact references:** {ARTIFACT_REFERENCES}

**Target files and symbols, when present:** {FILES_WITH_LINE_RANGES_AND_SYMBOLS}

**Relevant history, when available:** {COMMIT_LIST}

## Your Assigned Source

{SOURCE_NAME}

{SOURCE_PLAYBOOK_SECTION}

## Investigation Instructions

Gather evidence through this loop:

1. **Cast a wide net first.** Start broad so you don't miss related context, then narrow in on
   specific items.
2. **Read the whole record.** Read the relevant decision, note, Task evidence, or commit context,
   not just a title. The key evidence can be in rationale, alternatives, or a later reversal.
3. **Follow local references within your assigned scope.** Read referenced decisions, prior
   commits, and local notes. Record leads belonging to another investigator under "Additional Leads"
   rather than duplicating that investigation.
4. **Capture quotes verbatim** with their commit hash, artifact reference, or file:line.
   The synthesizer needs to cite this precisely.
5. **Note absences.** If you searched for something and came up empty, that's also a finding. Record
   what you searched for and what you didn't find.
6. **Watch for contradictions.** If two items in your source disagree, record both. Don't suppress
   the inconvenient one.

## Epistemic Discipline

Apply [epistemics.md](epistemics.md) for confidence, intent, and uncertainty rules.

- **No silent substitutions.** If the question is about feature X and you only find evidence about
  feature Y, don't present Y's evidence as if it answers X.

## Output Format

Return your findings in this structure. The synthesizer will read it directly.

### Source
Which local evidence angle you investigated: workflow artifacts, local documentation/comments,
or Git history.

### What I Searched
The queries you ran, the items you opened, the places you looked. Be specific. This tells the
synthesizer how thorough the investigation was and what might still be unsearched.

### Direct Evidence Found
For each piece that explicitly addresses the question:
- **What it says**: verbatim quote or accurate paraphrase
- **Where it's from**: commit hash, artifact reference, or file:line
- **Author and date** (if available)
- **Relevance**: one sentence on how it bears on the question

### Indirect / Circumstantial Evidence
Items that don't explicitly answer the question but bear on it. For each:
- **What it is**: brief description
- **Where it's from**: location
- **What it suggests**: what a careful reader might infer, and why. Name the inference chain.
- **Alternative readings**: if the same evidence could support a different interpretation, note it

### Contradictions
Two items that disagree with each other, with both citations.

### Gaps
What you searched for and didn't find. Be specific: "Searched local Plans and introducing commits
for the rate-limit rationale; none explained the threshold." These absences are valuable data.

### Additional Leads
Local references outside your assigned scope that another investigator should pursue. External
links without locally recorded context are evidence gaps; do not query remote integrations.
