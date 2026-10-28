# Review: do the `.each` worked examples behave correctly?

Angle: treat each example in `proposal-each.md` as product code and try to break it. Rules used:
v4 rule 6, rule 8 (every delivery handler ends unguarded), 2.5 (turn), P3, P4, P7, P11, P13;
Machines O5 (schedules) and O6 (omitted outcomes publish an issue and send nothing).

Severity: **blocker** = user is stuck, loses data, or a delivery is lost. **major** = wrong result in a
plausible sequence. **minor** = rough edge or readability.

## Cross-cutting findings (hit several examples)

**X1. `max` and duplicate keys can refuse a delivery. Blocker for the design.**
Section 1 says more than `max` keys, or a duplicate, refuses the turn (`InvalidTurn`), and that "the
host's own guard gives the friendly reason". That works for user events. It cannot work for
deliveries: rule 8 says a server or clock event must end in an unguarded alternative and must not be
lost. Several examples write the key list straight from server data or a late outcome:

- 3.4 `OrdersChanged`: server sends 201 orders, or one duplicate id. The turn is refused. The screen
  keeps the old list. Every later `OrdersChanged` repeats the problem.
- 3.5 `Heartbeat`: the 1001st device is refused on every beat. It is never learned.
- 3.6 `PinFailed`: 21 distinct rows fail at once (offline, bulk pin). The 21st failure event is lost.
- 3.7 `abandoned` strike and `PasswordAccepted` with an 11th challenge.

Fix: say in section 1 that a handler for a delivery must clamp and dedupe before it writes the field
(`slice(-max)`, `upsert`), and make `flow check` warn when a delivery handler writes an each-field
without a clamp. Or define overflow on a delivery as "drop the extra key with evidence" instead of
refusing. Refusal is only right for user events.

**X2. Omitted failure outcomes leave state stuck or hide data loss.**
O6 says an omitted failure sends nothing and publishes an actor issue. Most commits in the examples
map only `success`. The hot spots are 3.1 (`checking`), 3.1 (`SENDING`), 3.4 (bump), 3.8 (close),
1.0 (trash) and 3.5 (alerts, pages). Persistence P12 also turns an in-flight commit into `unknown`
on restore, so `unknown` needs a mapping wherever the state waits on the commit.

**X3. A copy removed in the same turn as its commit starts hides the retry path.**
1.0, 3.4 and 3.8 remove the key and start the server call in one transition. If the call fails, the
copy (and all its local state) is gone and nothing remembers the item. The pattern needs a
"closing/bumping/trashing" list that outlives the copy, cleared by the outcome, not by a guess.

**X4. Several API uses are not in v4 or the plans.** See the list at the end.

---

## 1.0 Inbox undo

**Major. The message reappears when the window ends.**
Sequence: Delete m1. After 5 s `onFinal` removes `m1` from `deleting` and starts `trash`. The view is
`messages.filter(m => !deleting.includes(m.id))`. Until the server list drops m1, m1 is visible
again. The user sees it flicker back, may click it, or may Delete it again (a second trash call).
Fix: add a private `trashing` list, cleared by the trash outcome (like `bumping` in 3.4), and hide
ids in either list. Same shape as 3.4, so one pattern should be named in the doc.

**Major. A failed trash is silent.**
`trash` has no `failure`, `unknown` or `defect` outcome. If it fails, the message comes back with no
notice, only an actor issue. After a reload mid-call it restores as `unknown`, also unmapped.
Fix: map failure and unknown to a `TrashFailed { id }` host event that shows a notice. With the
`trashing` list above, this clears the hidden state too.

**Minor. 51st pending delete gives `InvalidTurn`, not a reason.**
`max: 50` is on the placement, but the `Delete` guard only checks `AlreadyDeleting`. The doc says the
host guard gives the friendly reason. Here it does not. Add `memory.deleting.length < 50 || deny("TooManyPending")`.

**Minor. `check()` disables Undo, but `Undo` after the id is gone is `Unhandled`, not `Denied`.**
Fine in practice. Worth one line: the button must read `s.memory.undo`, not `check`, to know it exists.

Checked and sound: Undo vs `WindowOver` at the same instant (whichever is first wins; the other is
`Unhandled` or dropped by P11 and the dead life); double-click Undo; Delete, Undo, Delete again in
one second (old firing dies with the old life, new copy gets a fresh 5 s); the claim that restore
fires an overdue window once.

## 3.1 Team invites

**Blocker. `checking` can stay `true` forever.**
Sequence: type a valid email, wait 400 ms. `Quiet` sets `checking: true`. The `isMember` call fails
(offline, 500) or the tab reloads mid-call (restore gives `unknown`). The commit only maps `success`.
No `Checked` arrives. The row shows a spinner forever, and `Send` is denied with `StillChecking`.
Only typing again clears it. A user who is done typing is stuck.
Fix: map `failure`, `unknown`, `interrupt`, `defect` to a host event `CheckFailed { key }`, raise it
into the row, and have the row set `checking: false` (and a soft `CouldNotCheck` hint). Same event
must be unguarded in the row (rule 8).

**Blocker. `SENDING` has no way out.**
The `invite` commit maps only `success: E.Sent`. A server error leaves the actor in `SENDING`, where
the only handler is `Sent`. The form is dead. Fix: map failure to `SendFailed` and add
`SENDING: { on: { SendFailed: S.EDITING } }` with the reason stored in memory.

**Major. `Send` can pass before the pending check has run.**
Sequence: type a taken email, click Send within 400 ms. `value !== ""`, `error === null`,
`checking === false` (the debounce has not fired), so all three guards pass. The invite goes out
without the membership check. Fix: add a guard "no row has a quiet timer armed", e.g.
`schedules.rows.every(r => r.quiet === undefined)`, or set `checking: true` in `Changed` for a
valid value and let `Quiet` start the call.

**Minor. `Changed` clears `checking` while a call is in flight.**
Type `a@b.c`, call starts, edit and undo back to `a@b.c`. `checking` is false while the first call
still runs, and a second call starts after 400 ms. The first result matches the value and applies.
Harmless, but `Send` is allowed during the second call. Keep `checking` until a result for the
current value lands.

**Minor. Rows stay editable in `SENDING` and `SENT`.** `Changed` and `Quiet` still run. Add a
`canEdit` guard or end the debounce outside `EDITING`.

**Minor. Readability.** The name `Checked` is used three times (row host event, definition internal
event, raise mapper). `E.rows.Checked.from(({ event }) => event)` passes the extra `key` field into a
payload that does not declare it. Say in the doc that `key` is stripped, or write the mapper out.

Checked and sound: stale `Checked` for an older value (`Stale` guard, then unguarded fallthrough);
removal mid-flight (raise dropped with evidence, ids never reused because `nextRow` only grows);
`Quiet` ends unguarded.

## 3.3 Toasts

**Major. A repeated id refuses the whole `Notify`.**
`Notify` carries `id`. If a caller sends the same id twice (a retrying error toast with a stable id
like `save-failed`), the appended list has a duplicate and the turn is refused (X1). The toast is
lost and the second raise `Shown` never runs. Fix: upsert by id and raise `Shown` into the existing
copy so it re-arms. Or mint ids in the host from a private counter.

**Minor. `hovered` survives a reload.**
`hovered: true` is persisted memory. After restore the pointer is not there. The overdue `Elapsed`
fires, sees `hovered`, waits for an `Unhover` that never comes. The toast is stuck. Fix: do not
persist toasts, or clear `hovered` on restore, or drop the hover guard when the toast is overdue.
Touch screens have the same problem: no `Unhover` after a tap.

**Minor. `Close` and `Elapsed` both callback `onGone`.** Idempotent here, fine. Not a bug, but name
it in the doc.

Checked and sound: `Hover` while armed, `Elapsed` while hovered, `Unhover` re-arm (P11 drops the old
firing); the sixth toast pushing out the first in one patch; double Close.

## 3.4 Kitchen display

**Blocker. A failed bump makes the ticket vanish for good.**
Sequence: cook taps Bump. `onBumped` removes the order from `orders` and adds it to `bumping` in one
turn, then calls `bump`. The call fails. There is no failure mapping, so `bumping` keeps the id
forever. Every later `OrdersChanged` filters that order out. The ticket is gone from this screen, the
order was never bumped on the server, and nobody sees it. In a kitchen that is a lost order.
Fix: map failure and unknown to `BumpFailed { id }`. Remove the id from `bumping`; the next server
value brings the order back (or re-insert it from a saved copy of the record).

**Major. `Bumped` clears `bumping` at commit success, not when upstream catches up.**
Sequence: bump succeeds, `Bumped` clears the id, the subscription has not yet dropped the order, the
next `OrdersChanged` still lists it. The ticket reappears as a fresh copy (`started: false`, `age`
recomputed, `onLate` may fire `flagLate` again). The comment says "not yet gone upstream", but the
code does not wait for that. Fix: prune `bumping` inside `OrdersChanged` (drop ids no longer in the
server list), and use the commit outcome only for failure.

**Major. Server data can refuse `OrdersChanged` (X1).** More than 200 orders or a duplicate id.
Clamp and dedupe in the handler.

**Minor. `Start` is lost if the key flaps.** If the server list briefly omits an order and then
includes it, the copy is recreated with `started: false`. Keep `started` in host memory if it matters.

**Minor. Late-order flag storms.** An order older than 12 minutes seen for the first time fires
`Warn` and `Late` at delay 0 (two turns), then `flagLate` once per screen and per fresh actor.
`flagLate` must be idempotent on the server. Say so. Clock skew between POS and device shifts the colours.

**Minor. `input: ({ item })`** reads `item`. Fine if `input` fillers get `key` and `item` (the doc
says so), but v4 2.2 lists only `{ memory, event }`. Add `key`/`item` to v4's `input` row.

Checked and sound: schedules from `placedAt` survive re-creation and restore (Duration keeps its
deadline); `Warn`/`Late` order at equal deadlines (declaration order); Bump twice (second is `Unhandled`).

## 3.5 Device watchdog

**Major. Decommission is undone by the next heartbeat.**
"Devices are learned from their first heartbeat" and `Heartbeat` re-adds any unknown id. A
decommissioned device that is still powered sends a beat a few seconds later and comes back with a
fresh copy, fresh timers, and eventually a new alert. Fix: keep a `decommissioned` list and guard
`Heartbeat` (still unguarded alternative as the fallback that only skips the add).

**Major. Heartbeat for device 1001 is refused (X1).** Learning stops silently. Clamp, record an
overflow flag, and show it.

**Major. Restart raises a false alert for every device.**
The proposal makes deadlines survive reload. After a restore longer than 30 s, every `silence`
firing is overdue and fires once, before the first new heartbeat can arrive (FIFO mailbox). Every
device goes offline, `Alerts.open` runs 1000 times, then each `Beat` resolves it. Fix: do not
persist the fleet, or add a grace schedule after restore, or let `Silent` check a `lastBeatAt` kept
in memory. State the restore rule for monitors in the doc.

**Major. Alert and page commits have no failure path.**
`Alerts.open` and `Pager.page` map no outcomes. If paging fails, no one is paged and nothing retries.
Use `retry` (it is P4/P15 in v4, not P13) with an unbounded schedule for the page, and map the final
failure to an event. Also `Alerts.open` then `Alerts.resolve` for the same device can land out of
order, leaving an open alert for an online device. Say which concurrency (`serialize` per device) the
operation needs.

**Minor. Decommission leaves an open alert.** The copy ends, `onBack` never runs. Use `onLeave` in
the trait to notify a `onGone` callback when status is `offline`, or resolve in `Decommission`.

**Minor. Cost.** One full turn, one cancel and one re-arm per heartbeat, and a snapshot with up to
1000 copies each time. Fine on paper, worth a Stories load note.

Checked and sound: `Beat` re-arms silence (P11); `Escalate` after Beat or Acknowledge falls to the
unguarded alternative; new device added and beaten in one turn (first-pass seeding).

## 3.6 Issue pin flash

**Major. 21 flashes refuse a delivery (X1).** `PinFailed` is an outcome event. `upsert` past `max: 20`
refuses the turn and the failure is lost. Use `upsert(...).slice(-20)`.

**Major. `now` is not available in an outcome mapper.**
`E.PinFailed.from((e, { input, now }) => ...)`. P1 gives mappers `(value, { input, attempt })`. `now`
is given to `updateMemory`, action params and send mappers (Machines O3). Fix: stamp `at` in
`PinFailed`'s `updateMemory: ({ event, now }) => ...`.

**Minor. `optimistic: true` is not v4 syntax.** P13 says `optimistic` is a list of `setData` writes.
Write the real form, or say the example is shorthand.

**Minor. `deny(e._tag)`.** Machines O4 says `code` is a literal string. A dynamic tag is only legal if
the mapper's type is a literal union. Map tags to literals.

**Minor. Pin during a flash.** If a retry succeeds while the old flash shows, the stale reason stays
for the rest of the 3 s. Remove the flash on `Pin` success, or accept it.

Checked and sound: `resetOn: item.at` restarts the 3 s (reset gives a new life and re-arms `over`;
the old firing is dropped); `PinInFlight` guard with `.pending`; only flashing rows have copies.

## 3.7 Two-factor

**Major. As printed, unlock leaves the user in `LOCKED_OUT` forever.**
`onUnlocked` only removes the key. v4's version also moves the current challenge from `LOCKED_OUT` to
`ENTERING`. Here, after 5 minutes `LOCKED_OUT: {}` still handles nothing, so Submit is `Unhandled`.
Fix: restore v4's two alternatives (the `LOCKED_OUT` + `isCurrent` one that targets `ENTERING`, then
the plain removal). If this is just an abridgement, say "excerpt" on the callback too.

**Major. Ten abandoned sign-ins brick sign-in.**
`PasswordAccepted` adds a challenge id every time, and an id is removed only when it unlocks or on
sign-in. A user who goes Back and re-enters the password gets a new challenge each time. At the 11th,
`max: 10` refuses `PasswordAccepted` with `InvalidTurn` (X1) and no reason. Fix: add the id only on
the first strike (the `abandoned` and `CodeWrong` paths already do `union` and raise). `strikesOf`
already treats a missing copy as 0.

**Minor. Missing pieces.** `CodeAccepted` must clear `challengeIds` (v4 raises `Remove` for all); it
is not shown. `union` is used but not in the shared helpers list. `abandoned` writes
`challengeIds` and `challengeId`-free; fine, but state the key sets are disjoint from the leaving
transition (rule 12).

Checked and sound: a late `WrongCode` after Back re-adds and strikes in one turn (source patch plus
first-pass seeding); a strike after sign-in is ignored by the guard.

## 3.8 Inline editors

**Blocker. Close can lose the user's edit.**
Sequence: edit, click Close. `onClose` removes the row from `editing` and starts `save`. The save
fails. No failure mapping. The copy and the draft are gone. The user believes it saved.
Fix: do not remove the row on Close; mark it `closing`, and remove it from `Saved` success. On
failure keep the row open with the error.

**Major. Autosave failure is silent.**
`onSave` has no failure mapping. `saved` never advances, no hint shows, and the next `Quiet` only
runs after another keystroke. Map failure to a `SaveFailed` host event that sets a row error.

**Major. `input: ({ key, activities })` uses an input shape v4 does not have.**
v4 2.2 gives `input` fillers `{ memory, event }`. `activities` is not listed. Also `titleOf` can
return nothing before the lane loads. Copy the title into host memory when `Open` runs (event
payload or a `titles` map), and read that.

**Minor. Close then Open the same row fast.** The new copy starts from the old server title while the
close-save is in flight, so the editor shows stale text. The late `Saved` is dropped by the life rule
(correct). Fix with the `closing` list above.

**Minor. Overlapping saves can finish out of order.** `saved` can regress to an older draft. Use
`serialize` per row key. `Close` with a save in flight sends a duplicate save; harmless.

**Minor. Typing.** The shared `save` select uses `payload.draft`, which is `string | null` in
`onClose` and `string` in `onSave`. `title: payload.draft` is a type error; the guard does not narrow
it. `Open` also has no `max: 50` guard (X1).

Checked and sound: `Quiet` ends unguarded; closing cancels the pending debounce with the copy; reload
keeps the draft and an overdue autosave fires once.

## 3.9 Where `.each` is not needed

**Cart lines: fine.** `SetQty` is simple. Minor: an unknown `sku` is accepted as a no-op; add a guard if that matters.

**Upload queue: mostly fine, one wrong reference.** "retry (P13)" should be P4 (and P15 for the single
Attempt); P13 is optimistic writes. "The Attempt's lane" and per-file progress are asserted, not shown;
check Operations O6 before claiming it. A queue that limits parallel uploads, or shows a "retrying in
5 s" countdown, does need per-file timers, so the "not needed" line should name those cases.

---

## Examples that are fine (apart from the minors above)

- Cart lines (3.9).
- Inbox undo race logic (1.0): timer vs Undo vs re-Delete is correct; the problems are the visible
  flicker and the missing failure path.
- Toast hover / dismiss logic (3.3): the schedule, `armOn` and `Shown` design is correct; only the
  duplicate id and restore hover need fixing.
- Watchdog schedule logic (3.5): re-arm and escalation rules are correct; the problems are around the
  list, restart and failure paths.
- Pin flash core (3.6): reset and `.pending` use are correct.

## APIs used that v4 or the plans do not have

1. Outcome mapper context `{ input, key, now }`: v4 P1 has `{ input, attempt }`; `key` is the new
   proposal; `now` is not given to mappers (3.6).
2. `input` filler receiving `activities` (3.8). `key`/`item` in `input` is the proposal's own addition.
3. `optimistic: true` (3.6): v4 P13 is a list of `setData` writes.
4. `deny(e._tag)` with a non-literal code (3.6).
5. "retry (P13)" (3.9, upload): the retry rule is P4/P15.
6. `E.undo.key(k)` "already exists in v4" (1.0): v4 has it only for `.list` instances; check it is
   kept for `.each`.
7. `schedules.rows...` guard reads (suggested fix for 3.1) are fine: v4 amends O4 so guards get
   `schedules`.
