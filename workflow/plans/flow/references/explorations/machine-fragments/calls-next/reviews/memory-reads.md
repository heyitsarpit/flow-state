# Review: one behaviour for every memory read in a turn (D12, open question 1)

Scope: rules 10 and 11 of `calls-next/proposal.md` (section 4), D12, open question 1; `proposal-v4.md` 2.5 ("What
reads what", "Reading the same key twice"); `Machines.plan` O3, O4, O5, O6. Read-only review; nothing else edited.

## 1. Summary

- The proposal does not add two new views. Rule 10 ("final memory", computed in step 5) and rule 11 ("committed
  memory", used in step 6) are **the same value**: the memory the turn publishes. Call it **after**. The proposal
  adds the *readers* (selects, schedule functions, `keys`) to a view that v4 and Machines already use for
  `restartOn`, activity `params` / `when`, `.each` membership and the `resetOn` re-check, but never list as a view.
- v4's table is incomplete, so the "four views" count is really: **before** (the published snapshot), **before-walk**
  (before plus the source's patch), **initial** (a new incarnation's start), **after** (published memory).
- One value for every read is impossible (section 3). One principle fits every read, with a single named exception:
  **a read sees *before* if its result can change this turn's memory; it sees *after* if its result only feeds
  effects.** The exception is incarnation creation (`resetOn`, `input`), which sees before-walk.
- Recommendation: keep rules 10 and 11, but merge them into one rule worded by that principle, and give v4 2.5 a
  third row. Nothing already working breaks; one trap (mappers versus selects in the same transition) remains and
  gets a lint, not a rule.

## 2. Inventory: every memory read in a turn

"Today" cites the text. "Proposal" is rules 10 and 11 as written. "Rec." is section 5.

| # | Read | Today | Proposal | Rec. |
|---|------|-------|----------|------|
| 1 | Guards (host, part, state-token) | before: v4 2.5 table "every guard"; Machines O4 "from the pre-turn snapshot" | same | before |
| 2 | Source `updateMemory` | before: v4 table; Machines O3 | same | before |
| 3 | Parts' `updateMemory` | before: v4 table "parts' `updateMemory`" (even though the source's patch is already known) | same | before |
| 4 | Payload mappers: `raise`, `notify`, `exits`, `whenAbandoned .from` | before: v4 table; "Reading the same key twice" | same | before |
| 5 | Commit input select | before: v4 table and "Reading the same key twice"; Machines O3 (action parameters) | **after** (rule 10, step 5) | after |
| 6 | Retry / cancel key select | before (same lines) | **after** (rule 10) | after |
| 7 | `resetOn` first pass | before-walk: v4 table, 2.4 rule 1 | same | before-walk |
| 8 | `input` fillers | before-walk: v4 table, 2.2 | same | before-walk |
| 9 | `resetOn` re-check at commit (part-written keys) | after: v4 2.5 step 6 "Evaluate `resetOn` again on the committed memory"; unlisted in the table | same | after |
| 10 | Schedule function `({ memory, context, now })` | **unspecified**: Machines O5 does not say; P14 | after, called "committed" (rule 11) | after |
| 11 | `restartOn`, and its silent baseline on entry | after: O5 "After each committed turn" | same | after |
| 12 | `keys` (keyed schedules) | new | after (rule 11) | after |
| 13 | Activity `params` / `when` | after: O6 "After each turn" | same | after |
| 14 | `.each` membership and list repair | after: v4 2.5 "The final list", step 5 rule 9 | same | after |
| 15 | Optimistic `setData({ memory, event })`, `placeholder`, write callbacks | **unspecified** (post-commit callbacks, O3; open question 5) | unspecified | after |
| 16 | Guards and mappers of parts addressed to an incarnation created this turn | initial: v4 table | same | initial |
| 17 | Outcome mappers at the ending's turn `(value, { input, attempt, superseded })` | no memory read at all; `input` was fixed when the select ran | same | none |
| 18 | Views / `check()` | views read the published snapshot (= the previous turn's *after*); `check` runs steps 2 to 6 on it (v4 2.5; Machines O4 still says "without updating memory", which v4 supersedes) | same | same |
| 19 | Lane reads `pay.pending`, `retryCount`, owner test (rule 2) | not memory, but a fourth snapshot: the pre-turn snapshot **with the ending already admitted** (rule 9, 4.1) | same | note it |

Two things this shows. First, the inconsistency inside "before" itself: the source's `updateMemory` and its own
mappers both read before, but a part's `updateMemory` also reads before although the source patch is known. Second,
the only genuinely undecided rows are 10, 12 and 15; rows 5 and 6 are the only ones that *change*.

## 3. Why one value cannot hold

Dependency order inside a turn: guards choose the source and parts; the chosen alternatives produce patches and
payloads; patches make *after*. So:

- A guard or `updateMemory` reading *after* is circular (after depends on which guards passed and what they wrote).
  `check()` also could not answer from the snapshot alone: Machines O4 says views "can trust check" because guards
  read captured inputs only.
- A payload mapper for `raise`, `notify`, `exits` or `whenAbandoned` feeds a part, whose patch is part of *after*.
  Reading *after* is circular for the same reason.
- `resetOn` and `input` decide which incarnations exist and what they start with, before the walk. They cannot read
  *after*.

Conversely, reads that feed only effects (commit inputs, key selects, schedules, activities) have no reason to read
a value older than the one the turn is about to publish, and reading it is exactly what the two failure cases below
need. So the split is by what the read feeds, not by arbitrary history.

## 4. Candidate uniform rules, tested

Tests: (E) etag written and sent in one transition (P13); (R) Retry-After read as zero by a schedule (P14);
(G) guard predictability by `check()`/views; (X) `resetOn` cycles and lag; (W) two parts writing keys; (F) the
Field / Lockout / SignIn examples of v4 3.1 and the pager/checked reset of 3.4.

### A. Everything reads before; writes are seen next turn

- (E) fails as written: the select reads the old etag, false 412. Workaround is to read `event.etag`, which works
  only when the value comes straight from the event, not when `updateMemory` derives it. This is what v4 already
  tells authors for mappers ("Read the event instead").
- (R) fails: the `retry` schedule arms on the `Busy` turn and reads the old `retryInMs` (undefined or the previous
  value). Giving the schedule function `event` does not fix it: the author must repeat the backoff formula, and the
  sample's formula reads `memory.busyTries` where `updateMemory` has already added one, so the copies drift.
- `keys`, `restartOn`, activity `params` and `.each` membership cannot be "before" at all: they are evaluated after
  the commit by definition, and `restartOn` / `.each` already are. So A is not even the rule today.
- (X) `resetOn` on before lags a turn for every reset, not only part-written keys. The pager (3.4) would publish a
  snapshot with the new search and the old page, the issues activity would start a fetch for it, and the reset
  turn would start another.
- (F) Field's `input` start value derived from a key the source writes (D6, same-turn seeding) is stale again.
- (G), (W): fine. Verdict: breaks E, R, X and D6; rejected.

### B. Everything after the source's patch (or everything after) reads the final memory

- Guards cannot (section 3); `check()` would need to run updates to answer any guard. Parts' payload mappers and
  `resetOn` cannot (circular). Rejected as impossible, not merely worse.

### C. Two phases: decisions and patch-feeding values read before; effect-only values read after (recommended)

- (E) works: the select reads the etag this turn wrote.
- (R) works: the schedule function reads the `retryInMs` this turn wrote, the same value the view shows next.
- (G) holds: no guard, update or mapper changes, so `check()` and views are as predictable as today. Selects and
  schedule functions are computed in step 5, so `check()` already reports an invalid input or duration as
  `InvalidTurn`, with nothing published. (This is why "committed memory" in rule 11 is the wrong word: the value
  must exist before commit, since O5 and O3 make an invalid duration a pre-commit defect.)
- (W): parts' reads are order-independent (all see before); the disjoint-keys rule means *after* is unambiguous, and
  a select or schedule sees both parts' writes.
- (X): `resetOn` and `input` keep before-walk (exception E1 below). The re-check on *after* is the existing
  follow-up mechanism and now shares its view with `restartOn`.
- (F): Field, Lockout (guard `memory.strikes + 1 === limit` and its `updateMemory` read before; the timer's
  schedule is a constant), SignIn (`verify` select reads `challengeId` and `code.value`, written in earlier turns;
  the late-WrongCode turn adds the Lockout copy and raises into it, `.each` membership reads *after*) are unchanged.
- Costs: one remaining trap (section 6) and one added row in the table.

### D. Everything downstream of the source reads before-plus-source-patch; effects read after

This would make the source's own mappers (row 4) and parts' reads (rows 3, 4) see the source's patch, so the
"Reading the same key twice" trap for payload mappers disappears and `resetOn` / `input` stop being an exception.
It is the closest to "one behaviour" and is **not recommended now**:

- It reverses Machines O3's deliberate "both read the pre-turn snapshot and event", so a mapper can no longer see
  the value an update just replaced (an `onChanged({ from, to })` payload loses `from`; it would need an explicit
  `previous` in the context).
- Part guards would read memory a view's `check()` of the same event cannot know without running the source's
  update first. `check()` does run it (steps 2 to 6), but the plain-text guarantee "guards read the snapshot" goes.
- It changes behaviour for every existing guard on a part, not only selects and schedules, which the calls proposal
  should not decide. Listed as a follow-up for the owner, since it is the only path to two values instead of three.

### Where the cases land

| | A before | B after | C two-phase | D source-patch |
|---|---|---|---|---|
| E etag | false 412 | works | works | works |
| R Retry-After | zero / duplicated formula | works | works | works |
| G guards via `check()` | works | impossible | works | works, weaker text |
| X `resetOn` | lags every reset | impossible | works | works |
| W two parts | works | impossible | works | works |
| F v4 3.1 / 3.4 | D6 returns | impossible | unchanged | unchanged |

## 5. Recommendation

Rule C, with one necessary exception.

**The rule (replaces rules 10 and 11's separate wording):**

> A memory read sees one of two values. A read whose result can change this turn's memory (a guard, an
> `updateMemory`, a payload mapper that raises, notifies or fills an exit) sees **before**, the last published
> snapshot. A read whose result only starts or times work (a commit's input and key selects, a schedule function,
> `keys`, `restartOn`, activity `params`, `when`, optimistic and write callbacks) sees **after**, the memory this
> turn publishes: initial memory of new incarnations, then every patch in expansion order, after list repair. After
> is computed in step 5, so a failing read is a pre-commit defect (`InvalidTurn`).

**Exception E1, incarnation creation.** `resetOn` and `input` read **before-walk**: before, plus the source's patch
and earlier resets. They decide which incarnations the parts address and what they start with, so they run before
the walk and cannot see *after*; reading before would reintroduce D6 and a reset lag on every source-written key.
The `resetOn` re-check at commit is an *after* read (it already is), applied through the follow-up turn.

Why not fewer exceptions: guards, updates and patch-feeding mappers cannot read *after* (circular); `resetOn` and
`input` cannot read *after* either, and reading *before* is wrong for D6 and the pager. That is the smallest set.

## 6. What it changes and what it leaves

**Rules 10 and 11 (calls-next).**
- Merge them: rule 10 becomes "Reads that only feed work see the after memory", listing selects (input, retry key,
  cancel key), schedule functions, `keys`, and also naming `restartOn` and activity `params` as already doing so.
- Drop "committed memory" (rule 11) and "the turn's final memory" (rule 10) for the one term *after*, defined in
  2.5; state that it is computed in step 5 (before commit), which also settles that an invalid duration rejects the
  turn.
- `armOn` counted "anywhere on the active path" is independent of the view; keep it, and say the schedule function
  reads *after* of the arming turn whichever level accepted the event.
- Keep the 3.3 sentence ("writing `etag` and sending it in one transition works") and add a Retry-After sentence
  to 3.11 (sample at line 245 already assumes it).
- Section 10 question 1 and D12 become: answered by this rule, still marked "needs review" for the owner; the
  calls proposal no longer needs a separate Machines proposal for it.

**v4 2.5.**
- Table: add a third row **After** ("the memory the turn publishes, computed in step 5"), read by selects, schedule
  functions, `keys`, `restartOn`, activity params, `.each` membership, the `resetOn` re-check, optimistic and write
  callbacks. Rename "Source-updated memory" to "Before-walk" (same content); drop "commit selects" from the
  **Pre-turn** row.
- Replace "Reading the same key twice" by the principle: reads that feed patches see before, so a mapper that reads
  a key its own turn writes still sees the old value; a select or schedule sees the new one.
- Step 4 "Compute every payload and patch from the memory view in the table above" needs one more sentence:
  selects and schedule functions are computed last, from the memory the patches produce.
- Step 6 text on arming schedules: say they use the value from step 5.

**Machines.plan.** O3: split "action parameters" into patch-feeding (before) and effect-feeding (after) and exempt
commit selects and schedule inputs from the sentence "both read the pre-turn snapshot". O5: state that the schedule
function reads *after* and receives the same `now`; O4 unchanged. O6: unchanged (already after).

## 7. What this does not fix

1. **Same-transition split.** In one transition, `notify: [onSigned.from(({ memory }) => … memory.challengeId)]`
   reads the old key while `actions: [verify]` (select) reads the new one. The rule is stateable by what the read
   feeds, but it is two behaviours in one place. Keep the existing `flow check` warning for mappers (it needs no
   change), and add a Story-trace note when a mapper and a select read the same written key. Option D removes it, at
   the cost listed above.
2. **Pending reset edge.** A part writes a key that a `resetOn` watches, and the same turn starts a commit whose
   select reads that slice. The select sees the old incarnation's memory; the reset follows one turn later. Same lag
   as today's one-snapshot rule for part-written keys; document it next to the select.
3. **Lane reads (row 19)** are a fifth view by accident: the snapshot with the ending admitted. It is not memory,
   but a guard `pay.idle(key)` on an ending's own turn sees the lane after the ending. Document it in 2.5 so the
   table says what guards see.
4. **Rows 10 and 15 were unspecified** in the plan, so moving them to *after* is a decision, not a regression.
   Optimistic data in particular (v4 3.4 `listQuery({ memory })`) now reads the memory the pin turn publishes;
   confirm with open question 5 before the Operations plan is amended.
5. **Typing.** A select or schedule function reads *after*, so a part-written key the host did not declare readable
   would be visible to a select; v4 2.4 "Typing" already scopes slices to the placement node, so no change, but the
   spike should type-check one select that reads a trait slice written by the same turn.
