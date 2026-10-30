# Review 3 of operations-in-definition, revision 3 (2026-10-30)

One reviewer, correctness and authoring. These are suggestions, not decisions. Sketches are in the session scratchpad,
`ops-review-3/` (chat, checkout2, docs, kanban, search). Findings fixed in rounds 1 and 2 are not repeated.

**Verdict: another revision is needed, but a small one.** Key-based lanes are the right identity. The two-word
vocabulary is a real improvement. Three causes remain, and each needs one rule changed. Two of them still produce
silent wrong state in the proposal's own flagship examples: the autosave editor (8.2, 9.3) and search (9.5).

## Causes and fixes

| # | Cause | Findings | Fix at the cause |
| --- | --- | --- | --- |
| K1 | **Replacement is defined by start order, not by what reached the server.** Revision 3 drops the ending of a `latest` Attempt that is already *sent* as if it had never been sent, and still lets a newer start go out while an older unknown is unresolved. Endings concern one Attempt, but the members in a handler name a lane. | H1, H2, H3, M1, M2 | **Only a never-sent start is replaceable.** (1) A sent Attempt's ending is always delivered. (2) **A retained unknown holds its lane.** Under `latest` the waiting start stays waiting, under `reject` a start ends `Rejected`, until `retry` resolves the unknown or `cancel` releases it. This is M4 rule 30's record-queue hold, applied to every write. (3) Under `latest` the addressable Attempt is the oldest unresolved *sent* one, not the newest start. (4) Under `cancel` concurrency, an Attempt interrupted by a newer start is evidence only. (5) The row gains `uncertain`, M4's existing word, which is true while the lane holds an unknown. |
| K2 | **"The contract's key" names two identities.** For writes it is the server thing and the lane at once (D9). For reads, the resource key is the cache identity (`{ q }`), while the workflow slot is the operation (a search box) or the item (a tree node). Revision 3 claims one rule but quietly uses the operation for one-off delivery and the placement for `params` rows. | H4, M3, the hidden modes in section 7 | **State it per kind.** Write lanes are per contract key. Read lanes are per slot: a one-off read has one lane per operation (a plain row, and `cancel` without a key). Live reads have one lane per placement, with `each` giving one per key. Per-thing one-off reads use `each`. |
| K3 | **The key is a closure.** Nothing can read it (R10), it has no Schema for restoring, it cannot be derived from an item, and S4 checks it at `transaction()` before M4 rule 34 can supply the domain default. | M4, M5, the keyed-read cost, idle-row bugs | **`key: ["docId", "field"]`**: a list of input fields, like `primaryKey`. Its Schema is `input.pick(...)`. A domain write defaults to the entity's primary key, and S4 is checked at the operation. Members and `get` then accept any value that carries those fields (Q8 below). |

## Correctness

**H1 (K1). The plain `latest` race is a silent wrong state, and the proposal's own advice is not followed.** In 8.2
and 9.3, save "A" is in flight and "AB" is waiting. "A" ends unknown and is not delivered. "AB" succeeds and the page
shows "Saved". Then "A" lands late. The next live `Loaded` (a newer version, not dirty) puts "A" back into the draft.
`Docs.save` sends no version, so the 3.8 advice ("send `basedOn` or use `serialize`") is ignored by the flagship
contract. Nothing can enforce that advice. It also does not hold up with `basedOn` itself: a waiting start's input is
frozen when it starts, so its base is stale whenever the older write lands. A variant needs no flight at all: "A" ends
unknown and is delivered, the handler only shows a toast, the user types, and "AB" is sent at once because a newer
start releases the retained unknown (3.7). The same race follows. K1's hold rule closes both. Domain writes are less
covered than 3.8 says: M4 rule 32 lets the newer write's success clear the older write's mark, so a late landing after
the repair is also unseen.

**H2 (K1). A replaced write's success and failure carry facts, and those facts are lost.** An older save succeeds with
version 5 and is not delivered. The newer save is Refused. Memory then keeps version 4 and never learns that version
5 was written. Unknowns cannot be acted on, but successes and failures can, and they change server state.

**H3 (K1). The wrong-write retry survives under `concurrency: "cancel"`.** 3.8 covers only `latest`. A newer start
interrupts the in-flight Attempt, which ends `unknown: Cancelled` and is delivered (MD 2.7.8). Its handler's
`retry(k)` re-sends the addressable Attempt, which is the newest. A `cancel(k)` in that handler interrupts the newer
Attempt. M4 bans `cancel` only on predicting writes, so plain writes, such as an LLM `generate`, are exposed.

**H4 (K2). Search (9.5) is still wrong by default, and its view contradicts 3.4.** The user types "ab" and the search
starts. The user clears the box, which sets `hits: []`. "ab" is still the latest start, so `Found` puts its hits
under an empty box. Round 2's stale guard handled this case, and revision 3 removed it. The fix needs
`O.results.cancel(k)` with the old `{ q }`, which is a leaked key. `s.operations.results.pending` reads a keyed
contract (`key: (p) => p`) as a plain row, and `s.operations.typing` does the same in 9.1.

**M1 (K1). `reject` with a retained unknown allows a second charge.** A new `pay` start replaces the addressable
unknown (MD rule 21), because `reject` refuses only while something is outstanding. Any path from UNSURE back to CARD
reopens R1's double charge. K1(2) closes it.

**M2 (K1). The lane does not show its retained unknown,** so 5.3 keeps `memory.likeUnsure`, a mirrored id list (R9),
to key its reconcile schedule, and maintains it by hand in `Toggle`. With `uncertain` on the row, `keys` can read the
lanes.

**M3 (K2).** "A one-off read delivers its latest start" is per operation, but 3.4 and 3.5 make one-off lanes per key
(`get` with the idle row). A lazy tree that expands node A and then node B loses A's children, and A's lane vanishes.

**M4 (K3).** S4 at `transaction()` rejects `moveCard`, `setLabel` (9.4) and `Issues.setLike`, all `latest` without a
`key` and relying on rule 34. The rule must be checked where the domain default is known.

**M5 (K3).** 3.10 decodes restored keys "under the contract's key Schema", but a closure key has no Schema.

**M6. One write operation per contract.** The rule is a sound correctness cut. The "memory flag" idiom, though, is
correct only for an unkeyed lane, or one start at a time. Two kinds of start on different keys running concurrently,
such as a drag move and a keyboard move with different failure UX, need a per-key map in memory, which is C1's mirror.
For unkeyed lanes, route by state (rule 14): 9.2 reads better as PAYING_NEW and PAYING_SAVED. For keyed lanes, add an
input field the commit ignores; it is persisted with the Attempt, so it is correct. Write this down as a known limit.

**M7. `get`'s idle row hides wrong keys.** `{ id: card.columnId }` type-checks against `{ id: string }` and reads idle
forever. The same happens after a draft key gives way to a server id. Stories rarely catch this, because idle is the
common state. K3's item-passing makes such keys rare, and an entity-typed key (a domain write) turns the wrong kind of
item into a type error.

**L1.** `key` in a keyed schedule is a string (`d.docId === key`), but a record in mappers, which contradicts 3.5's
"one meaning". **L2.** In 9.3, `?? ""` in the save select would save an empty document if a race removed the entry.

### Original bugs and the audit cells, re-checked

| Bug | Revision 3 | After K1–K3 |
| --- | --- | --- |
| Wrong-write retry | fixed for `latest`, **open under `cancel`** (H3) | fixed: the addressable Attempt is the unresolved sent one |
| `.each` copies sharing a lane | fixed (copies own no lanes) | same |
| Two uses colliding | fixed (S6) | same; M6 is documented |
| Never-started reads | fixed (idle row) | same; M7 is reduced |
| Per-field autosave drops an edit | fixed (key per field) | same |
| Superseded unknown retries the wrong write | fixed by dropping it, but this **creates H1 and H2** | fixed by holding the lane |
| Audit's wrong cells (section 6) | as claimed, except row 7's addressability under `cancel` | as claimed |

## Authoring

| App | Lines: round 2 → revision 3 | Friction |
| --- | --- | --- |
| chat | 13 → 13 | a key required for one room per actor; a bare resource is live while a bare transaction is ignored (same syntax, two meanings); is the row plain or keyed? |
| checkout2 | 16 → 17 | memory flag (states read better); M1 |
| docs | 42 → 35 | 7 hand-built key records; the key copied into 5 event payloads only so handlers can find the document again; H1, H2; L1, L2 |
| kanban | 36 → 29 | M4 type error; event `cardId` against key `id`; `LabelUnsure` names no card, so it cannot be retried; the rebalance select reads the raw answer, not the predicted records (guess) |
| search | 13 → 9 | H4 |

## Concept count (0.2 claims 3 words and 0 modes)

- **Words.** `start`, `retryable` and `get`, plus three new *methods* on old words: `.outcomes()`, `.params()` and
  `.each()`. By 0.2's own definition ("keyword or method") that is 6.
- **Hidden modes (at least 3).** (a) One-off or live is decided by which outcome key is mapped. Deleting the `success`
  mapper turns `start` into placements, and a bare resource can never be one-off. (b) Bare means "the view reads it"
  for reads but "evidence only" for writes. (c) `cancel(k)` interrupts work, or releases an unknown, depending on the
  lane's state.
- **Hidden rules (6).** Row shape follows the contract key for writes, the placement for live reads, and the operation
  for one-off reads. `get` returns an idle row or `undefined`. Replacement scope is per key, per operation, or none.
  The key is derived three ways: a closure, `.predicts`, or `{}`. `key` has two meanings. `restartOn` runs per key and
  `armOn` is banned.
- **Honest count: 6 words, 3 modes, 6 rules.** That is still well below revision 2. K1 removes mode (c) (`cancel`
  only releases or interrupts its own Attempt), and K2 removes the row-shape rule.

## Keyed reads in views

**Count.** Every list row passes 2–3 keys. 5.3 passes `{ id }` 3 times (`Issue.get`, `like`, `rename`), and 8.4
does too. 9.4 passes `{ id }` twice and 9.3 `{ docId }` twice. 8.1 passes 1. 8.2 passes 1 for a *single* document,
plus 5 key-selector uses from memory. The machines declare 10 `thisX` selectors, about 30 uses in total.

**Proposed: views pass the item they render, never a key.** Use field-list keys (K3), and add one rule: in an
ending's turn, `retry`, `retryable` and `cancel` with no key address that ending's Attempt. This is checkable, because
`outcomes` declares which events come from which operation.

```tsx
// board.contracts.ts
key: ["id"],                                                     // NEW MEANING: input fields, like primaryKey
// CardView.tsx: receives `card`, the record it renders
const moving = useView(board, (s) => O.move.get(s, card).pending)  // NEW: get takes the item; Flow picks `id`
// lists: one read, rows beside items
const rows = useView(ws, (s) => O.save.rows(s, s.memory.open))     // NEW: rows; [{ item, pending, uncertain }]
// machine: no key selector in ending handlers
MoveUnsure: [{ guard: [O.move.retryable(3)], actions: [O.move.retry] }, toastOf("Move unconfirmed")]
```

This removes every `thisX` from ending handlers. Keys remain only where a user event names a thing (`Close`,
`Delete`), and even there a value that carries the fields is enough: `O.save.idle(({ event }) => event)`. `rows` is
optional; `get(s, item)` alone meets the goal without a new word.
