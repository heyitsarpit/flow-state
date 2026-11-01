# Response to review 2 (revision 3 of the proposal)

Written 2026-10-31. Each finding of [review-2.md](review-2.md) is listed with its **root cause** (proposal 0.1), what
revision 3 does, and where. Findings are advice; disagreements are stated with reasons. Everything stays proposed.

Root causes, in short:

- **C2′** The identity of a server thing was removed instead of placed (revision 2 fixed C2 by deleting `key`).
- **C4′** Replaced work was still delivered as if current (C4 fixed only partly).
- **C1′** Lane state was attached to data with a different lifetime (C1 over-applied).
- **C3′** Persisted identity used a chosen name where a stable one existed (C3 fixed only partly).
- **C7** New: rare cases got their own concepts.
- **C8** New: per-key time and file names were left unspecified.

The general move: every fix **removes** a concept. Revision 2 had 14 new words and 4 modes; revision 3 has 3 new words
and no modes (proposal 0.2).

## Correctness

| Finding | Cause | Done | Where |
| --- | --- | --- | --- |
| **H1.** Plain writes over non-entity rows lost their on-demand keyed lane (per-field autosave drops an edit) | C2′ | **Agreed with the cause; the fix is placed differently.** The contract's `key` is the lane's identity for every contract kind, lanes are created by work, a start derives the key from its input, and `latest`/`cancel` require `key`. The settings case is one lane per (doc, field). R2's `.each({ by })` on the operation would work, but states a server fact per use instead of once on the contract (R8); R2's `.single()` is `key: () => ({})` with no new word | 3.3, alternatives I, J |
| **H2.** A superseded unknown reaches the main handler; `retry` acts on the newer Attempt | C4′ | **Fixed by removal, not by a full `superseded` set**: a replaced `latest` Attempt's result is not delivered at all, for domain and plain writes, so a handler's `retry` always concerns its own ending. **Disagreed** with the full-set fix: no handler can act correctly on an older write's result once a newer one is addressable. Stated cost: a plain replaced unknown may land after the newer write unseen; such a contract should send a version or use `serialize` (B30) | 3.8, alternative K |
| **H3.** Record `pending` misses many-record writes, absent records, other actors | C1′ | **Removed.** The record keeps its shared state (`predicted`, `uncertain`), which already covers many-record writes and every actor; "this actor is saving this one" is the lane, read with `O.x.get(s, key)`. R2's fix (derive from queue entries) is correct but keeps a second place for workflow state (alternative N) | 3.4, 8.4 |
| M1. `retryCount` resets on reload | C3′ | persisted per Attempt | 3.10 |
| M2. Joined lanes, per-Attempt binding, member/plain mismatch, `.was` clashes | C3′, C7 | persistence by (contract id, key): unique because one write operation per contract; `.joins` and `.was` removed; a key that no longer decodes goes to `orphaned` | 3.10, 3.6 |
| M3. A deleted record never clears its mark; another actor's write mutates this actor's lane outside a turn | C1′ | lanes change only in this actor's turns; no store-driven release; no cap; `cancel` releases a retained unknown when the machine gives up | 3.5, 3.7, S7 |
| M4. Draining lanes: `cancel`/`retry` on a non-member; queued `serialize` starts after removal | C2′ | no membership, so no draining: a lane lives while it has work | 3.3, 3.7 |
| M5. `Inactive { data }` keeps data across params | C1′ | removed: an inactive placement is `undefined`; continuity is OPS O6's `placeholder`, asked for explicitly | 3.7, 9.5 |
| M6. `.joins` on `.each` must share the source | C7 | both concepts removed | 3.6 |

## Authoring

| Finding | Cause | Done | Where |
| --- | --- | --- | --- |
| **H1.** A live read can't be per member | C2′ | supported: `activities: [O.load.each(select)]`, one session per key of the contract, replacing `keys` on activities | 3.5, 9.3 |
| **H2.** One-off reads have no ordering; a hand-written stale guard | C4′ | **Agreed, with one difference**: a one-off read operation delivers only its latest start (the default R2 proposed); `.overlap()` is not added (a rare case: two operations or `each`). Replaces MD 2.7.9's "two fetches, two endings" (B31) | 3.8, 9.5, alternative L |
| **H3.** A bare `latest` operation contradicts the required `superseded:` | C4′ | `superseded:` removed; a bare write's results are evidence only (S10, Q7) | 3.2, 9.1 |
| **H4.** The member spelled several times; one member handle per list | C2′ | starts derive the key from the input, so only `retry`, `cancel`, `idle`, `retryable` and `get` take a key selector, written once per machine as a const (`thisCard`). **Partly disagreed** with `O.at(...)`: it is a new word for what a const already does (alternative M) | 9.4, 0.2 |
| M1. `.joins`: one row, two names; which name retries; persistence | C7 | `.joins` removed; a second kind of start is a second `start` plus a memory flag (9.2); one name, one lane | 3.6, 9.2 |
| M2. `*.operations.ts` holds contracts | C8 | renamed `*.contracts.ts` in every after example | 5, 8, 9 |
| M3. Starting before the member joins is a runtime `InvalidTurn` | C2′ | no membership: a start creates its lane | 3.3 |
| M4. Keyed-schedule re-arm per key is unspecified | C8 | `restartOn` evaluated per key on a keyed schedule; `armOn` there is a construction error | 3.12, 9.3 |
| Vocabulary: about 8 words and 2 modes for rare cases | C7 | 14 words → 3; 4 modes → 0; `.joins`, `.was`, `Inactive`, the cap, draining, `.live()`, `at`, `with`, `.emits`, record `pending` removed | 0.2 |
| Definitions: 42–47% operations; readable up to 3–5 | C7 | measured again (5.5): definitions +12 to +23, totals even; the split of one call into contract, operation and start stays by design | 5.5 |
| Names: `joins` → `sharesLane`, `was` → `renamedFrom`, `with` reads as a modifier, `.emits` misread | C8 | `joins` and `was` removed; `with` → `params` (the design's existing word for activity parameters); `.emits` → `outcomes` (the design's existing word for this mapping, streams included, M6 4.3.1). **Disagreed** with renaming round 1's way: an existing word beats a new one | 3.1, Q15 |

## The five round 2 apps

| App | Friction found | In revision 3 | Where |
| --- | --- | --- | --- |
| `chat.ts` | is `superseded:` required for a bare `latest` ping; is its unknown swallowed; `Inactive` branch in the view | no `superseded:` exists; a bare write's results are evidence (stated); `undefined` while not placed; the `idle` throttle is unnecessary | 9.1 |
| `checkout2.ts` | `.joins`: two names for one row; which name retries | one `pay` operation, two starts, a `method` flag | 9.2 |
| `docs.ts` | no per-member live read; `Replaced` cannot name its doc; a never-saved doc has no row; keyed re-arm guessed | `each` placement; no `Replaced`; `get` returns the idle row; `restartOn` per key | 9.3 |
| `kanban.ts` | the member's second spelling for `retryable`/`retry` | one key-selector const; also a rule-13 slip (an unknown mapped to a plain event) fixed | 9.4 |
| `search.ts` | version A needs a stale guard; version B shows old hits for an empty query | A is correct by default; B no longer retains data | 9.5 |

## The coordinator's other asks

| Ask | Done | Where |
| --- | --- | --- |
| Root causes, new or partly fixed | 6 causes: four are C1–C4 partly fixed (re-stated as C1′–C4′), two new (C7, C8) | proposal 0.1 |
| Fewer concepts; question rare-case concepts | each rare-case concept removed and its case rewritten with existing tools | 0.2, 3.6, 3.7, 3.10 |
| Breaks list | 35 entries: 10 resolved, 2 reduced, 5 open, 7 accepted, 11 withdrawn with their concepts | 7 |
| Porting counts | 145 document items (39 rewrites, 90 small, 5 deleted, 11 added), about 16 plan rows, 4 DD files | 5.6 |
| Round 1 and round 2 apps | the five round 1 apps (8.1–8.5) and the five round 2 apps (9.1–9.5) rewritten | 8, 9 |
| Open questions in rounds | Q1–Q20 in five rounds | 11 |
| Revision 3 note | under the status line | top |
