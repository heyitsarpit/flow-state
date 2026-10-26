# Trim brief: keep only what is necessary, as correct behaviour

You rewrite ONE plan file (named in your assignment) in place. Edit no other file.

The owner's instruction: keep only what is absolutely necessary for version 1, and describe what
the correct behaviour of an app built with Flow State is. The plans were written to restore every
archived commitment and are far too long. Cut them to the behaviour contract.

## Keep (rewrite as behaviour)

Each outcome states what an app author or an end user observes, in plain sentences:
"When X happens, Y happens; Z never happens." Keep a rule only if getting it wrong would make an
app behave incorrectly (lost edits, wrong data shown, stale data that never repairs, double
writes, stuck states, leaked data across users or requests, work that never ends, nondeterministic
tests, hydration mismatch) or would make two implementations disagree on observable behaviour.
Keep the public surface needed to state that behaviour (names, inputs, results, which outcome or
error fires), and numbers only where behaviour depends on them (e.g. a bound an author can hit).

## Remove

- Implementation mechanism, internal data structures, algorithms, encodings, internal ids.
- Provenance: "was FlowState D27", archive and inventory citations, review references, "restored
  from", ledger talk. The plan speaks in the present tense about behaviour only.
- Exhaustive tables of error codes, trace events, CLI flags, host matrices, exact codec limits,
  cross-runtime byte-equality, signal-exit details, artifact header fields, unless an app author
  directly depends on them. (Diagnostics keeps a short list of the codes an author will see.)
- Anything another plan owns: replace with one @plan.<Name>.<O> reference.
- Decisions that only restate an outcome. Keep a decision only when it records a real choice an
  implementer might otherwise reverse, in two or three lines.
- Multi-tab sharing (out of v1). Persistence keeps only: a second tab on the same scope runs
  without persistence and reports SecondTabNoPersistence (split-work/decisions.md ruling 38).

## Shape

- Same .plan grammar and the same outcome IDs where the outcome survives (other plans reference
  them); you may delete an outcome whose content is all removable, and then say so in your final
  message so references can be fixed.
- Verification: one line per gate, each proving a behaviour stated above (a Story, a test, a
  type error). No test-infrastructure detail.
- Questions: genuinely open behaviour only. Add one final question, "Deferred to build time",
  listing in one line each the removed items an implementer may still want to decide (at most 12).
- Target: at most 40% of the current length, and no more than 220 lines. Shorter is better.
- Run `workflow format --write <file>` and `workflow check <file>` from the repository root; fix
  findings in your file. Dangling references to deleted outcomes in other plans are acceptable;
  list them.

Final message (under 200 words): old and new line counts, outcomes deleted, dangling references.
