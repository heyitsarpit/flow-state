# Review 2 of the Story proposal (2026-10-30)

Two independent validation reviews of revision 2 (commit 5ac4d6c3): a correctness review, and a writing review
that wrote seven real Stories in the proposed API. Findings marked **verified** were checked against the source by
the main session. Revision 3 of [the proposal](../proposal.md) answers every finding; the last column says how.

## Correctness

| Id | Finding | What revision 3 did |
| --- | --- | --- |
| **C-H1** (verified) | Rule 9's "`advance` admits no turn" breaks dispatch-desk's `lockedOut` (`editor.story.ts:96-106`), whose retries re-arm only through a turn (`editor.machine.ts:202-207`); any timer chain diverges from production | **Q7 reversed**: `advance` runs like real time, each instant's turns included, in deadline order (rule 9). The mailbox race stays faithful because rule 14 decides by mailbox order. Settlement and admission are separate publication frames (G11). Every dispatch-desk clock command is checked (6.6) |
| **C-H2** (verified) | Rule 11 makes every dispatch-desk fixture invalid: they read `DemoServer`, a per-tab setup service (`fixtures.ts:15`, `:40`; `demo-api.ts:64`); conflicts with `T:57`, `T:63` | **Q9 revised**: a setup's fake server is provided to Stories as a stateful fixture that shadows it, so every tab meets one server; fixtures still depend only on fixtures and run-level services. Testing O3 amended explicitly; dispatch-desk changes listed (6.6) |
| C-M1 | `predicted` is not always false at settlement; omitted fields stay predicted until a confirming read | 3.12 and rule 16: carried fields are confirmed, omitted ones stay `predicted` until the confirming read (`EP:92-100`). Merge 4's comment fixed by erratum |
| C-M2 | A runnable-but-not-invoked write has no phase; unregistered sleeps are missing | `phase: "runnable"`; `pending` is computed from Flow's state, and a fixture sleep is listed once begun (3.6, rule 8) |
| C-M3 | `.control` has no order against later commands | `.control` runs non-turn work to idle before the next command; its arrivals are queued (rule 7) |
| C-M4 | The Operations O6 amendment confuses activity lanes with rule 21 lanes | Reworded: "Transactions have no activity lane; per-key lane state is on the snapshot only through commit-value reads" (6.4) |
| C-M5 | The `propertyTest` claim covers only part of `T:143-145` | A fault-by-fault table (3.12): fake-server faults are controls; crash/restore are tabs; adoption is lazy `ensure`; subscriptions and invalidate stay with `T:243` |
| C-M6 | `ending.key` equals the record key only under rule 34 | Wording restricted (3.6, Q6, Q36) |
| C-M7 | Queue removals named as cut evidence with no kind | Removals are read from the write's `ending` entry; no new kind (3.12, rule 16, 6.4 merge 4 row) |
| C-L1 | A retracted arrival in `pending` | A retracted firing leaves `pending` and fires on return (3.7, rule 9) |
| C-L2 | `reloadMidCharge` needs a delay so the write is really in flight | `FakeStripe({ answerAfter: "1 second" })`, the close at 200 ms, and the expected truth (3.7) |
| C-L3 | `advanceToNextTimer` stopping at fixture sleeps | It targets the earliest Flow schedule, running earlier fixture sleeps on the way (rule 9) |
| C-L4 | Does `answerAfter` delay the list load? | Renamed `writeAnswerAfter`; reads answer at once (3.12) |
| C-L5 | `check()` in an ending's own turn reads a still-pending lane | No change: a frame's `check()` answers against the published snapshot, which is what production views show; the ending's turn itself sees the lane updated (rule 22). Recorded here |
| C-cite | `M2:661` blank; `T:106-107` should be 107 | Re-pointed to `M2:660` and `T:107` |

## Writing

| Id | Finding | What revision 3 did |
| --- | --- | --- |
| **W-H1** (verified) | `busyThenPaid` scripts 503, which the design's commit classifies as unknown (`machine-design.md:864-866`) | 429 in the proposal (3.5) and by erratum at `machine-design.md:1192` |
| **W-H2** | "charges === 1" passes for a same-Attempt retry | Truth records every request with its key; the example compares `attempt.id`s of `ending` entries with them (3.5); trap row (3.13) |
| **W-H3** | Reload mid-write under-specified | When truth changes is the fake server's choice; its work runs in the run's scope, so a closed tab interrupts only the client (3.5, rule 11); `Restored` reason shapes (3.6); the run log keeps a closed tab's entries, each with `tab` (rule 14) |
| **W-H4** | Lane reads need a commit value that is local to the machine body | **Q40** (provisional): `Definition.O` at module scope, so commit values are exported (3.14, rule 17). Section 9 asks the owner, with a transaction-keyed read as the alternative |
| **W-H5** | "Never shown twice" needs frame reads | Every checkpoint read takes any frame (rule 14); "never" assertions run over `frames: "publication"` (3.13 example) |
| W-M1 | A timer arrival's identity in `pending` | Arrivals carry `event` and `from` (`"schedule"` with path and key) (3.7) |
| W-M2 | Exact time knowledge needed | `advanceToNextTimer`, `pending.dueAt` and `s.schedules` instead of repeated arithmetic (3.7) |
| W-M3 | Attempt id scheme, across reloads | Opaque, seeded per tab name and open count (`T:37-39`); a restored Attempt keeps its id; compare ids, never literals (3.6) |
| W-M4 | `predicted` and `uncertain` right after an unknown | 3.12: kept predictions and `uncertain` at settlement; server state, still `uncertain`, once the repair lands |
| W-M5 | Fixture options invented per author | Shown as a pattern (`answerAfter`, `dropFirst`, request truth); standard controls rejected, since Flow knows no server semantics (3.5, section 8) |
| W-M6 | No `whenAbandoned` example in a trait Story | `Pager/left` (3.2) |
| W-M7 | `calls` cumulative across lives | Stated, with a `life` filter (3.2, 3.3) |
| W-M8 | Exit shapes differ between `checkpoint.exit` and `calls`; alone-path unclear | `checkpoint.exit` is the `calls` record plus `exit`; alone, exits are at `calls.<exit>` (3.2, rule 5, Q39) |
| W-M9 | Refusal causes in fragment Stories | Harness names never appear; a harness denial shows the verdict's reasons; a send in `OUT` is `Unhandled` (3.2, rule 2) |
| W-T | Traps: checkpoint before `process()`; `pending` against `predicted`; truth without Attempt ids; `.find` on endings by key; transient states | Section 3.13 lists each with how it is designed out or documented |

## Errata outside the proposal (2026-10-30)

- `machine-design.md:1192`: `busyThenPaid` scripts 429.
- `merged/entities.md:388`: "another tab's rename" becomes "another actor's rename".
- `merged/entities.md:372`: "prediction ended" becomes "fields the response carries are confirmed; omitted
  ones stay predicted until a confirming read".

## Left for the owner

Q40 only (proposal section 9): how a Story and a view reach a commit value's lane reads.
