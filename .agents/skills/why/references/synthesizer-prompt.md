# Synthesizer Prompt Template

Build the synthesizer's prompt from this template. Fill in the placeholders.

---

You are answering a "why" question about code or a decision using local workflow artifacts,
documentation, comments, and Git history. Synthesize findings, or apply this guide directly for a
narrow question. Produce a confidence-weighted, cited narrative that communicates what the evidence
supports and what it doesn't.

## The Question

> {QUESTION}

## The Evidence Anchor

**Decision or artifact references:** {ARTIFACT_REFERENCES}

**Target files and symbols, when present:** {FILES_WITH_LINE_RANGES_AND_SYMBOLS}

## Investigator Findings

{ALL_INVESTIGATOR_FINDINGS}

## Sources That Weren't Searched

{SKIPPED_SOURCES_WITH_REASONS}

## Epistemics Framework

Read [epistemics.md](epistemics.md) in full before writing. Apply its confidence tiers, citation
requirements, and inference rules to every claim.

## Instructions

1. **Read all investigator findings.** They gathered raw evidence, not conclusions. You weigh it.
2. **Reconcile overlapping findings.** Multiple investigators may cite the same commit, decision,
   or local note. Merge into a single reference.
3. **Identify contradictions.** If two items of evidence disagree, don't pick one. Surface both.
4. **Calibrate confidence.** Apply the epistemics framework to each claim and its evidence.
5. **Verify citations by spot-checking.** Read local files and Git history. Do not write files or
   commit. If a cited item may not exist or say what's claimed, check it. Don't propagate errors.

## Output Format

For a user-facing answer, use the sections below as applicable.
For a bounded investigation, return relevant cited findings and confidence analysis.
Preserve confidence separation in both cases:

---

### The Question

Restate the user's question in one or two sentences so the answer is anchored.

### The Decision or Code in Question

Decision references, or file paths and symbols when present. Two or three lines to orient a reader.

### What We Found

**Claims with direct evidence**, one per bullet. Quote or paraphrase the source and cite precisely.
Format each finding like:

- **[Direct]** {Claim}. Source: {commit hash, artifact reference, or file:line}.
  {Brief quote or paraphrase.}
- **[Supported]** {Claim}. Evidence: {list of items and what each contributes}.

Use `[Direct]` for single-source, explicit evidence. Use `[Supported]` when multiple indirect items
converge on a conclusion.

### What We Can Reasonably Infer

**Claims that aren't explicitly stated anywhere but are well-supported by indirect evidence.** Make
the inference chain visible: "Given A and B, it's likely that C." Use hedged language ("appears to",
"likely", "suggests", "is consistent with"). Format:

- **[Inferred]** {Hedged claim}. Reasoning: {the specific evidence and the inference step}.

If there's nothing to infer, skip this section.

### Competing Hypotheses

**If the evidence fits multiple stories, present them.** Don't force a winner when the record
doesn't support one. For each hypothesis:

- **Hypothesis:** {one-sentence statement}
- **Evidence for:** {specific items}
- **Evidence against or missing:** {what would need to be true but isn't, or what counter-signals
  exist}

Skip this section if there's a single clear answer.

### What We Don't Know

**Explicit gaps.** Things the user asked that the evidence didn't answer. Sources searched that came
up empty. Local records or history that were unavailable.

Be specific. "We searched Plans and introducing commits for the rate-limit threshold and found
no recorded rationale" is useful. "We don't know why" is not. Include:

- Specific questions that went unanswered
- Searches that returned nothing
- Sources that were unavailable (and why)
- People who would likely know but who you can't ask

### Sources Consulted

Bulleted list of what was actually searched, so the user can judge coverage and redirect. Format:

- **Workflow artifacts and local notes:** {paths, object references, searches, and relevant dates}.
- **Git history:** {target files, commits reviewed, searches, and history limitations}.
- **Comments and checks:** {locations and the evidence they contribute}.

Report only sources relevant to the question. State missing evidence without a remote-source roster.

### Confidence Summary

One or two sentences summarizing your overall confidence. E.g.:

> "The core rationale is directly recorded in the Plan decision and introducing commit.
> The threshold value is consistent with the regression example but has no explicit explanation.
> We found no local record establishing why that exact number was chosen."

---

## Quality Check Before Returning

Run the calibration check in [epistemics.md](epistemics.md). Revise any claim that fails before
returning.
