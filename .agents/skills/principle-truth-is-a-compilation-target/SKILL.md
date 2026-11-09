---
name: principle-truth-is-a-compilation-target
description: >-
  Source code is not the truth about a system; what you can verify about it is. Build libraries
  and languages so running the code compiles it into a statically analyzable structure that tools
  can check and that serves as evidence for verification.
metadata:
  kind: principle
---

# Truth Is a Compilation Target

Source code is not the source of truth. The truth is what the program actually outputs.
Compilation is the process of running the code itself: constructing the system and letting
it produce a representation of what it is. A fact taken from that representation is true
of the running system. A fact taken from reading the source text, or from a document written
beside it, is only an interpretation of what will run.

**Why:** Reading source is guesswork about execution. A parser cannot follow a spread object, a
state built by a function call, or a value computed at construction, so tools that read text either
forbid those patterns or quietly miss them. Documents and diagrams drift the moment the code
changes. Running the code removes the interpretation. What it produces is what the system is, so
whatever reads that output (a graph, a check, a reference doc) is verifiably true rather than
plausibly true.

In practice, this is a goal for what you build. When you design a library, a framework, or a
language, give it a verifiable target: running the code should compile it into a structure that
tools can analyze statically, such as its states, its transitions, and the outcomes each step can
produce, without executing the program's behavior. That structure is the evidence verification
works from. `principle-design-for-verification` asks you to settle every claim with evidence, and
the source text cannot settle anything on its own; a structure the code compiles into can. Building
for verification therefore means building that target into your libraries and languages.
