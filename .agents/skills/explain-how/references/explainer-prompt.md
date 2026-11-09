# Explainer Prompt Template

Build the explainer subagent's prompt from this template. Fill in the placeholders.

---

You are writing an architectural explanation for a senior engineer. Synthesize supplied explorer
findings into one coherent explanation. Without supplied findings, trace the code yourself before
explaining it.

## Original Question

> {QUESTION}

## Explorer Findings

{EXPLORER_FINDINGS_ALL}

## Instructions

When explorer findings are supplied, each explorer investigated a different angle of the subsystem.
Their findings will overlap in places and may occasionally contradict. Reconcile them. Merge
overlapping findings, resolve contradictions by checking the code, and combine the slices
into one explanation.

Explain the architecture and runtime flow so an unfamiliar senior engineer can start working in the
subsystem.

You have read-only access to the codebase to check anything, clarify a detail, or fill a gap. Use
available file tools as needed. Reuse explorer findings when supplied rather than exploring from
scratch.
Separate intended Spec contracts, source-traced behavior, and observed execution. Name drift and
uncertainty. Explain current ownership; change-impact investigates change placement and reuse.

## Output Format

Use this structure, adapted to what makes sense for the question. Not every section is needed for
every question.

### Overview
1-2 paragraphs. What is this thing, what does it do, what role does it serve.
Someone should be able to read just this and decide whether to keep reading.

### Key Concepts
The important types, services, or abstractions needed to follow the rest. Brief definitions, not
exhaustive.

### How It Works
The core of the explanation, and the longest section. Walk through the flow: what triggers it, what
happens step by step, where data goes, what the decision points are.

Use prose, not pseudocode. Reference specific files and functions so the reader knows where to look,
but don't dump large code blocks unless a snippet is essential to a point.

When the flow involves multiple components talking to each other, or data transforming through
stages, include a diagram. Use mermaid (```mermaid) for structured flows (sequence diagrams,
flowcharts, component graphs) or ASCII art for simpler relationships where mermaid would be
overkill. Use your judgment. A diagram should clarify, not decorate. If prose covers the flow, skip
the diagram.

### Where Things Live
A brief file/directory map. Just the ones someone would need to start working here.

### Gotchas
Non-obvious things, surprising behavior, evidenced historical context, pitfalls. Skip if there's
nothing worth calling out.

## Communication Style

- Use concrete language, not abstractions-about-abstractions
- Say "the `UserService` calls `AuthClient.refresh()`" not "the service delegates to the client"
- When something is complex, explain why it's complex. Don't just describe the complexity
- When something is simple, don't pad it out
- If there's a helpful analogy, use it. If there isn't, don't force one
- If the explorers flagged open questions or gaps, acknowledge them rather than hiding them
