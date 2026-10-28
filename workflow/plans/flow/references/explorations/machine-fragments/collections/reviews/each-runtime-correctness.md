# Review: `.each` semantics and runtime correctness

Angle: does section 1, 1.1 and 2 of [proposal-each.md](../proposal-each.md) hold up against v4
rules 1, 6, 8, 9 and the turn algorithm (2.5)? Scenarios are event sequences. "Unsure" marks
things I could not settle from the text.

Short verdict: the model is sound, but three places break rule 8 or contradict the proposal's own
examples. Fix those before accepting.

---

## Blockers

### B1. `max`, duplicate keys and "raise into absent key" refuse turns that rule 8 says cannot be refused

Rule 8: outcomes, timer firings, `abandoned`, `onLeave` and exit fillings are never lost. The
proposal says `max` or a duplicate key "refuses the turn (`InvalidTurn`)". v4 treats that as a
pre-commit defect: prior state stays, one issue-only snapshot, "not retried for that input".

Scenarios:

1. Kitchen display (3.4). `OrdersChanged` is an activity `value` outcome. The server sends 201
   orders, `max` is 200. The handler writes `orders` with no guard (it cannot know to guard).
   The turn is refused. The update is lost, and the screen shows stale tickets until the next
   push. A server that sends a duplicate id does the same, every push.
2. Issue table (3.6). `PinFailed` is a commit failure outcome. It upserts into `flashes`
   (`max: 20`). The 21st failing row refuses the turn. The outcome is lost: the optimistic pin
   is never reconciled by the host's own handler.
3. Toast `Elapsed` firing (timer delivery) runs `onGone`, whose filling writes `notices`. If a
   filling also appends (any host that pushes a replacement), a refusal drops the firing.
4. 1.1 says a raise into a key "that only a later part adds refuses the turn". v4 rule 9 limited
   refusal to turns "not sourced by a delivery" and dropped the part otherwise. The new text lost
   that distinction. A delivery-sourced filling that adds a key and raises into it loses the
   whole delivery.

Why it is wrong: the host's guard cannot help, because the handler is a delivery and rule 8 says
it ends in an unguarded alternative. External data (activity values, server outcomes) is exactly
where `max` and duplicates come from.

Fix, either:
- In turns sourced by a delivery (rule 8 list), a `max` or duplicate violation is not a refusal.
  Apply a deterministic repair: drop duplicates keeping the first, keep the first `max` keys, and
  record evidence. User-sourced turns still refuse. Same rule for raise-into-absent-key: drop the
  part with evidence in delivery turns, refuse otherwise (restore v4's wording).
- And add a `flow check` error: a delivery-reachable handler that writes an `.each` field without
  bounding or deduping it must say so (a lint for `[...list, x]` and wholesale replacement from
  event data).

### B2. Commit-time removal runs `onLeave` in a follow-up turn, which breaks "never lost" and "cannot refuse"

1.1 pass 2: a removed copy is dropped at commit; its `onLeave` runs as a follow-up at the head of
the mailbox, "reading the copy's last memory". v4 rule 1 says pending resets are **not persisted**,
and 2.5 says `onLeave` "is never queued, because it is fused". The proposal reuses the pending-reset
mechanism for something that is a delivery.

Scenarios:

1. A toast (or a challenge, or an editor row) removes itself through its own callback. The commit
   publishes. The process dies or the actor is persisted before the follow-up runs. On restore,
   the copy is gone and no `onLeave` exists. The obligation (for example "save the unsaved draft")
   is lost. Rule 8 lists `onLeave` fillings as never lost.
2. The follow-up runs `onLeave` fillings that write host memory. They may append to the key list
   and exceed `max`, or re-add the removed key. Rule 6 says `onLeave` "cannot refuse", but
   nothing says what happens on overflow here. Re-adding the key creates a new life in the
   follow-up turn (pass 1). That is consistent, but then the follow-up writes a key the previous
   turn's parts wrote, and the user sees remove, then add, as two snapshots.
3. The pre-turn snapshot of the follow-up no longer contains the copy. Rule 2.5 says payload
   mappers read the pre-turn snapshot. "The copy's last memory" therefore needs a tombstone
   stored somewhere in the snapshot. The text does not say where, whether it is persisted, whether
   it appears in views, or when it is freed. Unsure whether the authors meant the descriptor-style
   handling used for `orphaned` (P19).
4. Several removals in one commit: order of the `onLeave` runs is not defined (list order of the
   pre-turn list? removal order?).
5. Source removals (pass 1) fuse `onLeave` into the same turn; self-removals defer it. The same
   logical event (a copy ends) has two timings depending on who wrote the list. A host that
   relies on "`onLeave` and the removal are atomic" gets it only half the time.

Fix: make pass 2 fuse too. Compute the committed key set during step 3/4 (the patches are all
known before commit), so a removal by a part is a removal in this turn, and `onLeave` is fused in
the same turn. Parts' patches are computed from the pre-turn snapshot (2.5 table), so this is
possible without running anything twice. If a follow-up is kept, persist the pending `onLeave`
list with the actor, define the tombstone, define order, and apply B1's repair rule to it.

### B3. The new identity rule contradicts the sign-in example (3.7) and would drop a lockout strike

Identity (section 1): "A delivery armed or started under one life never reaches a later life of the
same key: it is dropped." v4 rule 9 had an exception: if the addressed life is dead and **the same
turn re-adds the key, the in-turn life wins; the sign-in relies on this**.

Scenario (3.7): password accepted, challenge C created, user wrong-codes, Back, the lockout
copy for C is unlocked and removed. A late `WrongCode` outcome arrives (commit started under
C's life 1). The `abandoned` handler re-adds C and raises `Strike` to C in the same turn. Under
the new text the raise belongs to a chain started under life 1, and life 2 is "a later life of the
same key". The strike is dropped. An attacker's failed attempt does not count.

Why it is wrong: the example and the rule disagree, and the rule decides. The security-relevant
case silently fails open.

Fix: restate the v4 exception in the new rule: the fence drops a part only when **no life of that
key was created earlier in the same turn**; a life added in this turn is addressable by the chain.
Add 3.7 as a conformance Story. Then say what pass 1 and pass 2 do when the re-add is by a later
part (1.1 says "two lives"; then the chain's raise cannot reach it either, since raises only
reach pass-1 keys). That is a real gap in this case and should be spelled out.

---

## Major

### M1. `.each` on a node with `.resumable()`: key changes while frozen are undefined

Scenarios (all unsure about intended behaviour; the text is silent):

1. Node N has `Toast.each("notices").resumable()`. The user leaves N. Copies freeze with `dueAt`.
   While away, the host removes key `a` and later re-adds `a` (new notice, same id). On return,
   the frozen life of `a` thaws with its old `hovered` memory and an overdue `dismiss` that fires
   once. A different notice is dismissed by the old notice's timer. Per section 1 it should be a
   new life.
2. While frozen, a key is removed. Is the frozen copy ended (and `onLeave` run, though the node
   is inactive and "freezing is not ending") when the removal happens, or when N is re-entered?
   Pass 1 and pass 2 run on every turn; they must say whether they reconcile frozen sets.
3. A key is added while frozen: created on re-entry, fresh? With entry schedules armed in the
   entering turn? Raise into it in the entering turn is the existing "raise into a fragment the
   turn enters" defect (rule 12), so a host that wants to seed on entry cannot.
4. Per-copy `resetOn` for a resumable `.each`: "fresh only when `resetOn` differs from the value it
   was frozen with" works per copy, but the list-level case (removed and re-added while frozen)
   is not a `resetOn` change.

Fix: reconcile frozen sets on every turn like active ones, but defer `onLeave` for frozen copies
removed while frozen to the re-entering turn (fused, run once, reads the frozen memory). A frozen
copy whose key is removed is dead, so a re-add is a new life. Say that freezing a non-empty set
that later changes is the normal case, and add a Story.

### M2. The key field is a hot shared key, so the "disjoint keys" and shallow-merge rules bite constantly

Machines O3: one `Partial<Memory>` patch shallow-merges once. v4 2.5 step 5 requires disjoint
keys between the source and parts, and rule 12 makes overlaps a construction error.

Scenario: toast stack. `Notify` (source) writes `notices` and raises `Shown` to the new toast.
If that toast's `Shown` notifies a callback that also writes `notices` (for example to trim), the
source and the part write the same key. Overlap defect. Reverse case: user event `Close` is the
source (child event), `onGone` writes `notices`. Fine alone. But two parts in one walk (the source
raises into two copies, each calling a callback that removes itself) both write `deleting`, both
computed from the pre-turn list, so the second overwrites the first or the turn is refused.

Why it matters: every `.each` host funnels every copy's self-removal through one field. The
proposal's examples hide this because each turn has one writer.

Fix: say how the list field composes. Suggest a declared reducer: parts may return
`remove: [key]` / `add: [...]` instead of patching the field, or the key field's patches from
multiple parts are applied in expansion order against the running value (but mapper reads stay on
pre-turn memory, so filters like `memory.deleting.filter(...)` would lose earlier edits). Without
one of these, require `flow check` to flag two potential writers of the field in one turn.

### M3. Max and duplicate validation is not ordered before commit for part-written lists

1.1 puts pass 2 in step 6 (commit), "after patches". Validation (step 5) happens before step 6.
A part's patch makes the list exceed `max` or contain a duplicate. At step 5 nobody has computed
the merged list for the `.each` check unless the validator does. If it is first seen in step 6, the
turn cannot be refused any more (already applying exits and entries).

Fix: state that step 5 validates the final key list (pre-turn list with the source patch and all
part patches applied in expansion order), including `max`, duplicates, and the key field's type.
With B1's repair rule for delivery turns.

### M4. Commit joining across lives can lose the new life's outcome (unsure)

Operations "finite actions start or join" (Machines). Suppose `commit` is keyed by canonical
parameters, as in 3.4 (`{ orderId: key }`) or 3.8 (`{ id: key, title: draft }`).

Scenario: editor row 5, draft "x", Close. A `rename {id:5,title:"x"}` commit is in flight. The user
reopens row 5 (life 2) and the same `rename` starts again with the same parameters. It joins the
in-flight commit (life 1's). The outcome carries life 1's captured incarnation. It is dropped as
"dead life". Life 2 never learns it saved. In 3.1 the analogue is a `checking: true` that never
clears, blocking `Send` with `StillChecking` forever.

I could not confirm the join semantics; check the Operations plan. If joins are real, the
incarnation capture must be per start request, not per joined commit: each starter that joined
gets its own outcome delivery.

### M5. Persistence, restore and hydration (K7) are not specified

Unsure about intent on all of these:

1. What is persisted per copy: memory keyed by key, plus incarnation? The text says "incarnations
   captured by commits and armings persist" only in v4 rule 9, which this proposal removes.
2. Restore reconciliation: persisted copies vs the persisted key list disagree (schema migration,
   hand-edited store, a crash between writes). Whose truth wins? Which copies are seeded, which
   are dropped without `onLeave`?
3. A persisted list that already has a duplicate or exceeds a newly lowered `max`. If validation
   runs on every turn rather than only on turns that write the field, the actor is bricked:
   every event refuses. State that validation applies to the turn's *final list* only when the
   turn wrote it, and that restore repairs (B1's rule) with evidence.
4. Pending resets and pending `onLeave` are not persisted (B2). Per-copy `resetOn` baselines are
   re-taken silently on restore, so a copy whose `item.version` changed just before the crash never
   resets. This is v4's accepted behaviour for single traits; for N copies it is N silent losses.
5. Hydration (server rendering): `input` fillers that read `activities` (3.8 `titleOf(activities.rows,key)`)
   run at seed time. On hydration the activity data may differ. Say that hydration restores
   persisted copy memory and never re-runs `input`.
6. Timer tie-break (K7): copies that arm in the same turn with the same deadline fire in separate
   turns. Order must be defined (list position at arming time). If the host builds the list from
   an unordered source, Stories differ per run. Say "list order at arming" and let the lint flag
   unsorted sources.

### M6. `check()` can disagree with the runtime

1. `check()` runs steps 2–6 and never the follow-up turn from B2. It reports `Allowed`; the
   follow-up may then overflow `max` or write the key back. With B2's fix (fuse) this goes away.
2. `check()` on a delivery event (outcome, firing): per B1, the runtime repairs and the turn
   commits; `check()` must report the same, not `InvalidTurn`.
3. Unhandled vs stale view: `E.undo.key(k).Undo()` is `Unhandled` when `k` is absent. A view
   that disables the button from `check()` is right at the snapshot but wrong if a mailbox item
   (WindowOver, or a Delete that re-adds) is ahead of the click. That is normal for mailboxes,
   but it means the user's click can reach the **new** life of a re-added key (see m3).

---

## Minor

### m1. `key` and `item` are not defined in every position

Unsure where the types cover these; the text does not:

- `resetOn`: examples use `item`; `key` should be there too. For bare-key lists `item` should not
  exist in the type (3.1, 3.5 use bare lists); say it is absent, not `undefined`.
- `schedule: ({ memory, now })` (3.4): the copy's own memory has `placedAt`, so it is fine. But a
  schedule that needs the key or the item has no way to read them. Add `key`/`item` or say input
  fields are the route.
- Commits: `key` is available in a copy's filling and its outcome mapper. A commit declared once at
  machine scope (3.1 `check`) and listed in a non-copy transition has no `key`. The proposal says
  commits are checked at each transition that lists them (v4 rule 1), so this should be a type
  error; say so.
- Nested `.each` (a fragment places `.each` over its own memory, the host places that fragment
  `.each`): the inner `key` is the inner one; how the outer key reaches the inner filling, and how
  views address `E.outer.key(a).inner.key(b)`, is not defined.
- Names: a trait memory field called `key` or `item` collides with the synthetic fields on
  `s.memory.<name>[i]`. Reserve both.
- Key charset: `rows["row-2"]@1` in Stories and event addressing suggest `[`, `]`, `@`, `.` are
  unsafe in keys. Either encode or restrict.

### m2. A key removed and re-added in one patch cannot restart its copy

"Unchanged" is deliberate, but then a host that wants "same id, new notice" must use `resetOn`.
Say that in the rules next to section 1.1, and give the toast (re-notify with the same id) as the
example. It is a footgun for users who mean "replace".

### m3. User events address a key, not a life

A stale view click `E.undo.key("m1").Undo()` sent before `m1` was undone and re-deleted lands on
the new life (new 5-second window). Deliveries are fenced; user sends are by design not. State it,
or let views include the incarnation they rendered (rejected in the proposal; fine, but note the
trade-off).

### m4. A copy added and removed in the same turn

Pass 1 adds K (lazy seed), a part removes K, pass 2 drops it. It never appears in a snapshot but
its `onLeave` (B2) runs in a follow-up, with "last memory" being the seed. Say that a copy never
published has no `onLeave` (my preference) or that it does.

### m5. `.each` field type vs `max` at definition time

`Flow.initial(...)` constant lists longer than `max` should be a construction error. Computed
initials cannot be checked. Say so.

### m6. Cost note

Pass 2 re-runs every copy's `resetOn` on committed memory every turn. For 1000 devices that is
1000 calls per turn. Say that `resetOn` on `.each` runs only for copies whose `item` changed
(compare by key and `Equal.equals` first).

---

## What I checked and found sound

- Pass 1 ordering with `resetOn`: removal before reset, new copies not reset, `onLeave` fused
  after raises into a fresh life. Consistent with v4 rule 1.
- Seeding a pass-1 key lazily from source-updated memory, a pass-2 key from committed memory.
  Consistent, assuming B2/B3 are fixed.
- Late timer firings for a removed key: dropped by the fence; the activation-ended rule in Machines
  O5 covers the plain case, and the incarnation covers remove then re-add.
- "Removed and re-added inside one patch is unchanged" is well-defined for membership.
- Node-placed non-resumable `.each`: leave ends all copies, entry creates fresh ones; fused
  `onLeave` for N copies is a long turn but not wrong.

## Suggested order of work

1. B1 and M3 together (one rule: validate the final list in step 5; deliveries repair).
2. B2 (fuse pass 2, drop the follow-up) and M6.
3. B3 (restore the in-turn exception) with the sign-in Story.
4. M1, M2, M5 as short rules with Stories.
5. M4: read the Operations join rules.
