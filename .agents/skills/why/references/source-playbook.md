# Local source guide

Start from the evidence anchor and inspect local sources. Do not assume artifact placement.
Use supplied paths or existing project discovery; no Plan or Spec is required to answer.

- **Plans:** decisions, rationale, alternatives, constraints, and answered questions. Follow precise
  references rather than repeating the Plan.
- **Specs:** source and basis, intended guarantees, open obligations, and relevant history.
  A current contract alone does not establish why it was chosen.
- **Tasks:** recorded implementation choices, experiments, regression evidence, and limitations.
- **Local documentation and comments:** design notes, ADRs, changelogs, and explicit explanations.
- **Git history:** introducing commits, prior designs, artifact changes, and reversals. Use
  [code archaeology](sources/code-archaeology.md) for commands and pitfalls.

Read only the evidence needed for the question. For defensive code, also use
[incident context](sources/incident-postmortem.md). Report missing local evidence without creating
replacement documents.
For requested or directly linked connected sources, use [the remote guide](remote-sources.md).
