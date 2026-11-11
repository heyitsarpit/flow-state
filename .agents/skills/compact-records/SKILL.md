---
name: compact-records
description: >-
  Shrink a project's working records (notes, logs, Task comments, status files, instruction
  sections) by replaying them against their sources: keep decisions, corrections and traps with
  their evidence, drop what can be re-read from the code or history, fix or flag what the sources
  contradict, and consolidate by subject under a short head. Use at an area's or phase's
  close-out, when a record passes its size limit, or when the user asks to compact records.
metadata:
  kind: procedure
  applies:
    - policy-records
    - policy-writing
    - principle-claim-only-what-you-checked
---

# Compact Records

Records grow with every session, and every agent that loads them pays for their length. Shortening
them is not summarising them: a summary written from the record alone keeps its mistakes and loses
the facts it paraphrases. Compaction instead replays each entry against its sources (the code, the
version history, the files the entry cites) and keeps only what is true, current and not already
written somewhere an agent can read.

Git keeps the full text, so nothing is lost by deleting it. What is lost is anything a reader needs
and can no longer find: a decision, the reason for it, how to reverse it, or a trap someone already
fell into. This skill exists to delete everything else.

## Terms

- **Record:** any file agents read to learn the state of the work: a log of notes, a Task's
  comments, a status file, or a section of instructions.
- **Writer:** an agent or person that adds entries to a record.
- **Holder:** the one agent allowed to edit a record while it is being compacted.
- **Decision:** a choice someone made, with who made it.
- **Amendment:** a decision that changes a rule or a plan.
- **Correction:** an entry that says an earlier one was wrong.
- **Trap:** an entry that says something looked true and wasn't, or that a step fails
  in a way a reader would repeat.
- **Instruction section:** the part of a record that tells agents how to work, as opposed to what
  happened.
- **Generated result file:** a file a command writes, such as test counts or gate results; it can
  be re-created, so the record need not repeat it.

## When to run it

- At the close of an area or phase, after its last review, so the next one starts from short
  records.
- When one record passes its limit: by default 300 lines for a log, 100 lines of comments on one
  Task, or an instruction section that repeats a rule.
- When the user asks.

Not on every change: compacting mid-work deletes context the current builder still needs, and two
agents editing one record overwrite each other.

## Before you start

1. **Take the record.** While you work you are its only holder. Ask each writer to stop writing and
   to keep its pending entries aside until you finish, and use the same channel to release it.
   Never edit a record another agent is changing.
2. **Name its sources.** For each record, list what its entries can be checked against: the version
   history, the code, generated result files (test counts, gate results), and the records it links
   to. An entry with no source to check is kept, marked unverified.

## Steps

1. **Classify every entry,** reading its source as you go:
   - **Keep** a decision, a correction or a trap: what was decided or found, why, who decided it,
     and how to reverse it. Keep the decider's own words verbatim where they settle something, and
     quote exact rule text (an invariant, a requirement) rather than paraphrasing it.
   - **Drop** what can be re-read: commit lists, test and gate counts, file inventories, "started",
     "resumed" and "done" entries, and anything a generated file or the history already holds.
     When an entry mixes the two (a count beside a trap), keep the decision or trap and drop only
     the part that can be re-read.
   - **Supersede** an entry a later one replaces. Keep one line, "Superseded: ... (date)", only if a
     reader might otherwise act on the old version; otherwise drop it.
   - **Correct or flag** an entry the current source contradicts. Fix it if the source settles the
     truth; otherwise mark it "Contradicted by <source>" and list it in your report. A wrong entry
     that survives compaction is worse than a long record: agents will act on it. When the reason
     for a decision turns out wrong, correct the reason but leave the decision as it stands, and
     list it for whoever made it: only the decider changes a decision.
2. **Consolidate by subject.** Merge entries about one subject into one, ordered by subject, not by
   date. Each kept entry is one to three lines: the decision or finding first, then its reason, its
   reverse, and a link to its evidence. Move detail one link down; never copy it.
3. **Mark status.** Each kept decision says whether it is confirmed (by whom, when) or proposed.
   Each kept fact says how it was known (a test, a review, a reading of the code). Where the entry
   gives no decider or date and the history doesn't either, write "unattributed" and list it.
4. **Keep a short head.** A record that agents load at the start of every session starts with a few
   lines saying what is current, linking to the rest. The head is part of the record, not a new
   page. Instruction sections state each rule
   once, in its current form, grouped by topic, with no history.
5. **Shrink, don't grow.** The result must be shorter than the input. If every entry is a kept
   decision and nothing can go, report that and change nothing; the result is never longer. Do not
   create pages that only restate other pages; a page that abstracts nothing is bloat.

## Check before you hand back

- **No decision lost:** list every decision, amendment and correction in the input, and show where
  each one is in the output, or which later entry supersedes it.
- **No link broken:** every link in the output resolves; run the link check the project's
  instructions name, or check each link by hand if it names none.
- **No contradiction kept:** every flagged entry is fixed or listed.
- **Smaller:** report the line count before and after, per record.
- **A second reader:** start a different agent and give it the output and the sources, not your
  reasoning. It checks every corrected entry and a sample of dropped ones (at least ten, or one in
  ten if there are more than a hundred) against the sources, and confirms nothing a reader needs
  was lost.

Then release the record to its owners and tell them where their pending entries go.

## What you return

The records changed, their sizes before and after, the entries corrected or flagged, anything you
kept only because you were unsure, and the second reader's verdict.

## Watch out for

- **Summarising instead of verifying.** A shorter copy of a wrong record is still wrong.
- **Paraphrasing the terms that matter.** Exact wording of a rule or a user's decision is evidence;
  a paraphrase is not.
- **Deleting the reason.** A decision without its reason and reverse gets re-argued.
- **Dropping traps.** "This looked true and wasn't" is the most expensive kind of note to lose.
- **Inventing structure.** New index pages, categories or summaries that no reader needs.
- **Compacting a record someone is writing.** Take it first.
