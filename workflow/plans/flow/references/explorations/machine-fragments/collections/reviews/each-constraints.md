# Review of `.each`: does it keep the project's constraints and principles?

Angle: constraints K1–K9, requirements R1–R9, static analysis (K2), and the yardstick problems in
[principles.md](../../principles.md). Inputs: [proposal-each.md](../proposal-each.md),
[problem.md](../problem.md), v4 sections 2.2–2.5 and rules 1, 6, 8, 10, 12.

## Verdict

No blocker. `.each` keeps one actor, one turn and one graph. The **shape** of a collection is static
(trait, key path, type, bound). The **membership** is not, and the proposal does not say so. Several
claims are stronger than the text supports ("never reaches a later life", "no snapshot ever shows…",
"max is how far model() explores"). Eight majors, listed below, mostly need one sentence of rule or
one added plan line each.

## Table

| # | Verdict | Reason |
| --- | --- | --- |
| K1 one turn | holds with caveat | Both passes are inside the turn. But the commit-time pass adds keys and checks (max, duplicates, `Flow.input` decode) after step 5 (validate). Those checks must move into step 5. See F3. |
| K2 static, single graph | holds with caveat | Shape is static. Who adds or removes copies, and whether a raise finds its key, are not. See section "K2 stress". |
| K3 no child actors | holds | Copies are traits. |
| K4 one active leaf | holds | Copies have no states. |
| K5 definition / machine | holds | `.each` and the key path are structure. `input`, fillings and key writes are behaviour. |
| K6 typed | holds with caveat | `traits: { rows: T.each("rowIds") }` names a field of the same object literal. That is self-referential typing, the same risk as v4 open item 4. `item` of a `Flow.private` field would leak it (F10). |
| K7 deterministic | holds with caveat | Keys are host data, good. The per-key life needs a persisted counter that survives removal (F4). Pending `onLeave` is not persisted (F3). Computed schedules (3.4) are not in v4 (F7). |
| K8 no fragment I/O | holds | Commits stay in the host, with `key`. |
| K9 locality | holds with caveat | `max: 5` on the placement and `length < 5` in the Add guard (3.1) state one fact twice. |
| R1 changing count | holds with caveat | Overflow past `max` refuses the turn, even when a server delivery caused it (F2). |
| R2 reuse | holds | The trait does not know it is repeated. |
| R3 own state and timers | holds with caveat | Fresh on create, timers cancelled at commit. `.resumable()` with `.each` is unspecified (F9). |
| R4 stable identity | holds with caveat | Only fenced for commits and timers started in a copy. See F4. |
| R5 host controls membership | holds | Only host transitions write the list. A copy can only ask (callback). |
| R6 reading | holds with caveat | `s.memory.rows` in order, no joins. `item` leaks private fields (F10). |
| R7 addressing | holds | `E.rows.key(k)`, `key` in fillings and outcome mappers. |
| R8 plain data stays plain | holds | C6 is an array, no `.each`. |
| R9 familiar | holds | Reads as a keyed list. `key` is overloaded (F9). |

## K2 stress: what `flow check` and `flow graph` compute

**Computable before run time**

- The template summary of the trait, once (events, callbacks, exits, totality, `onLeave`). Copies
  are identical, so one summary covers all of them.
- The key path exists, has the right type, and `key` names a string field of the record (K6).
- The placement: one node "EmailRow × rowIds ≤ 5". Unfilled required ports, once.
- The raise graph at the placement level: host transition to `E.rows.X`, and callback edges from
  `rows` back to host fillings. `flow graph` can draw both.
- Rule 8 totality, per template. A timer-fired handler is total by the summary, whatever the count.
- Two `.each` placements over the same field (legal; two parallel copy sets). Worth a rule and an
  info finding.

**Not computable (closures stay opaque, v4 rule 12)**

- **Which transitions add or remove copies.** That is "which transitions write the key field", and
  `updateMemory` is a closure. v4 never parses closures. So the graph cannot draw membership edges,
  and cannot warn "nothing ever adds a key" or "nothing ever removes one" (a leaked copy). Only
  Stories and `model()` can show it.
- **Whether a raise finds its key.** "Raise into an absent key refuses the turn" is a run-time
  outcome. v4 rule 12 has the same split for tokens, but the proposal's own examples (3.5 Heartbeat,
  3.7 abandoned) depend on "added in the same patch", which only a closure shows.
- **Duplicates and overflow of the key list.** Run time (`InvalidTurn`).
- **Overlapping keys.** The key list is one memory key written by every copy's removal callback.
  A source patch that also writes it, with a raise that triggers a removal callback, overlaps. The
  rule exists (disjoint keys, step 5), but it is a runtime defect or a warning only closures
  separate. Expect this to be common here, because the list is the one shared key.
- **Copies ending themselves.** A callback that removes its own key is a host filling. The summary
  cannot say "this callback ends the copy".
- **Computed schedules (3.4).** `schedule: ({ memory, now }) => …` makes the delay a closure. The
  graph cannot show it and `model()` cannot bound it (F7).

**Nested `.each` in a fragment.** Rule 10 hides the inner level: the outer's summary is all the host
sees. That part holds. What is missing is in F6.

**Verdict.** K2 as worded in problem.md ("analysable as a declared shape, not discovered at run
time") holds. The stronger reading, "all structure known before run time", does not: membership and
key presence are Story-only. The proposal should say so, and say which `flow check` findings are
Story-derived (as v4 already does for the read-after-write warning).

## Yardstick problems related to lifecycle, identity, timers

| Problem | Verdict | Note |
| --- | --- | --- |
| L1 stale timers | prevented | Cancelled in the removing commit. A firing already queued is dropped with evidence (P11-style ids). |
| L2 late results | holds with caveat | Fenced for work started in a copy filling. Not for a host-started commit that carries a key (F4). |
| L3 leftover memory | prevented, one subtlety | Remove and re-add inside one patch keeps memory and timers (React-like). In two turns it resets. Two behaviours by timing. Minor, document it. |
| L5 abandoned effects | holds | A commit in flight when its row is removed still reaches the host. The raise is dropped. 3.1 and 3.8 show it. |
| L6, L8 phantom replies | holds | Dropped with evidence. Asymmetric with a non-chain raise, which refuses (F2). |
| E1, E4 | holds | Host removal is a host right. `onLeave` covers cleanup. |
| E3 hidden endings | allowed | The copy cannot end itself. A host that ignores `onGone` leaks the copy until `max` (minor, F9). |
| D1 drifting copies | holds with caveat | `item` is the host's own object. But 3.4 stores server rows in memory (F8). |
| D5 restore in flight | holds with caveat | Persist life counter and armed deadlines (F4). |
| D7 drafts lost | at risk | `onLeave` for a part-written removal runs in a follow-up turn that is not persisted (F3). |
| T1 partial turns | holds | Whole turn refuses. |
| T2 schedule traps | holds | `armOn` plus `Shown` raise works. Creation arming is stated for added keys. |

## Findings

### Major

**F1. Membership writes are invisible to `flow check` and `flow graph`.**
The graph shows one node, but not who creates or ends copies, nor whether a raise finds its key.
These are the questions an author asks of a collection.
Fix: state this limit in 1.2. Derive "writes the key field" from Story traces, as the read-after-write
warning does, and add warnings: no Story ever adds a key; a copy callback is filled without
writing the key field (leak); a raise into `.each` on a transition that does not write the field.
Optionally let `flow graph` draw membership edges from traces, marked "observed".

**F2. `max` and duplicates can refuse a delivery, against rule 8.**
`Heartbeat` (max 1000), `OrdersChanged` (max 200) and any activity value write the key list from
server data. If the data has more than `max` keys or a duplicate, step 5 refuses the turn with
`InvalidTurn`, and a server-produced event is lost. Rule 8 says deliveries are never lost. The
host guard cannot help: the data is not an event the host can deny.
Fix: pick one. (a) Rule 8 handlers that write a key list must truncate or dedupe by construction,
and `flow check` errors if a delivery handler writes a `.each` field with no visible bound.
(b) Overflow and duplicates in a delivery turn commit the turn and drop the extra keys with
evidence. (a) keeps "exactly one copy per key". Add the same carve-out to the raise rule: a
non-chain raise into an absent key inside a delivery handler must not refuse.

**F3. The commit-time pass contradicts v4 on `onLeave`, and its safety is unspecified.**
- v4 rule 6 and step 1 say `onLeave` is fused and never queued. Here a part-written removal runs
  `onLeave` as a follow-up turn.
- v4 says `onLeave` fillings "write only keys the leaving transition does not write". The
  follow-up has no leaving transition.
- v4 says pending resets are not persisted. For a reset that costs a one-snapshot lag. For
  `onLeave` it costs the notification forever (the copy is already gone), which is D7 (a draft
  lost) and L5.
- Keys added by a part are seeded after step 5. `max`, duplicates and `Flow.input` decode failures
  would then surface after validation, a K1 violation.
Fix: run the second pass on the computed committed memory inside step 5, and refuse there. Persist
the pending `onLeave` records (key, life, captured memory) with the snapshot. Amend rule 6 and step
1 to name this one exception. List these in section 5, which today mentions only "section 2.5 gains
two passes".

**F4. Identity is overstated: "never reaches a later life" holds only in part.**
- Capture happens for commits and timers started in a copy filling. A commit started in a host
  transition whose outcome raises `E.devices.X` by key has no captured life. If the key is reused
  (device id, issue id), a stale result lands on the new copy. The author cannot fix it, because
  lives are private. 3.1 survives only through its `event.value === memory.value` guard.
- A raise carries only a key. The text does not say which life it addresses when the chain
  captured copy A and the mapper names copy B.
- 3.7 contradicts the Identity paragraph. A late `WrongCode` re-adds the key and strikes it in one
  turn. The text says a delivery never reaches a later life. v4's f3 rule ("in-turn re-add wins")
  is needed and is dropped from the proposal.
- `rows["row-2"]@1` implies a per-key counter. A counter on a removed key must outlive the copy,
  which is a tombstone per key, unbounded. A single global monotonic life counter, persisted, avoids it.
Fix: capture (key, life) for any raise whose mapper key equals a key the chain started in; say what
happens otherwise (addresses the present life). Restore the in-turn re-add rule. Use a global life
counter. Soften "never" to "never, for work started in a copy".

**F5. `model()` exploring "up to `max`" is not workable.**
`max` is a run-time bound (5, 50, 200, 1000). Exploring 200 copies with timers is not feasible, and
copies are interchangeable, so most of it is waste.
Fix: a separate `explore` bound (default 2 or 3), with symmetry between copies (explore one
canonical copy per distinct memory). Keep `max` for the runtime only. This touches Testing O5 and
v4 T1.

**F6. Nested `.each` inside a fragment is not specified.**
- Addressing: `E.outer.key(a).inner.key(b).X`? Not stated.
- `key` and `item` in an inner filling shadow the outer's. A name for the outer key is missing.
- Membership: the inner key list is the outer's memory, so the host cannot write it (rule 4). The
  outer must declare a `hostEvent` to add or remove inner copies. That reintroduces Add/Remove one
  level down, and is fine, but it should be stated as the pattern.
- Cost: `max` multiplies (5 × 5 copies for exploration and for Inspection names).
- Reconciliation order: outer copy created in pass 2, then inner keys seeded from its initial
  memory. Removing an outer copy ends every inner copy: how many `onLeave` follow-ups, in what order?
Fix: one paragraph with the path form, the `outerKey` naming rule, and the order (deepest first,
as rule 6 already orders exits).

**F7. Quiet plan changes the proposal does not list.**
Section 5 lists rule 9, section 2.5 and the removed words. Also needed:
1. Rule 1 says "on a list, a reset removes every instance". Per-copy `resetOn` (the `rows` filling,
   3.6) means one copy resets. Amend rule 1.
2. Rule 6 and step 1 on `onLeave` (F3).
3. Computed schedule delay from `memory` and `now` (3.4). v4 schedules take durations. Machines O5,
   and `flow graph` timings, change.
4. `now` in outcome mappers (3.6). P1 gives mappers `{ input, attempt }` only. Add `key` and `now`
   (Operations O2).
5. `activities` in the `input` filler (3.8). The v4 table says `input` reads source-updated memory.
   With a pure start (React O2, server rendering) activities do not exist yet.
6. The commit descriptor and Attempt record carry `key` and a life. This touches P12 (restore),
   P19 (`orphaned` has no actor and so no copy).
7. CommandLine O5: the `crypto.randomUUID()` lint, and the new warnings from F1.
8. Inspection O1: node label "× field ≤ max" and the `@life` names. Testing O1: how a fragment is
   tested alone with N keys.
9. Machines O1 typing: placement refers to a memory field of the same literal.
Fix: add a "changes beyond rule 9" list to section 5 with these nine lines.

**F8. Example 3.4 puts server rows in memory, against the project's own rule.**
Principles section 2, constraint 6: memory holds keys and drafts, never copies. 3.4 copies up to 200
orders into `orders` so that `item.placedAt` can feed `input`. That is D1 (drifting copies) between
the activity and the memory. Q2 itself says copies are for items with live behaviour and the data
stays in the activity, then 3.4 does the reverse.
Fix: keep key-only lists and read data in the filling from `activities` (F7.5 must then land), or
state that a server-driven collection may mirror the keys only. The `{ key: "id" }` record form
should be described as "your own UI records" (notices, flashes), not server rows.

### Minor

**F9. Small specification gaps.**
- `.resumable()` with `.each`: are keys added or removed while the node is inactive reconciled
  (frozen copies created or dropped)? Does `onLeave` run for a frozen copy that is removed?
- `key` means five things: the copy key, an event payload field (`RemoveRow { key }`), the
  `.key(k)` path, the `key:` option naming a record field, React's `key`. Rename the option to
  `by: "id"`, or reserve `key` and `item` in trait event and memory names (type error).
- `max` and the Add guard both say 5 (K9). Let the guard read the bound: `deny("TooMany", { max })`
  from the placement, or drop the guard and rely on `InvalidTurn` only where the host has no guard.
- A callback that is meant to end its copy (`onGone`) can be ignored by the host, and the copy
  leaks. Covered by F1's leak warning.
- Remove then re-add in one patch keeps memory, but across turns resets. Document with the React
  analogy.

**F10. `item` and private key fields.**
If the key field is `Flow.private` (3.7 `challengeIds`) and records are used, `item` exposes the
host's private record in views. Make `item` a type error on a private field, or omit it outside the
host.

**F11. Testing alone (principle 10).**
`story.machine(fragment)` needs a way to supply keys (`.keys([...])`) and to drive membership. Add
to Testing O1.

## Suggested order of work

1. F3 and F2 (they change the turn rules the proposal says it only extends).
2. F4, F1, F5 (claims and tooling).
3. F7 (the plan-change list), F6, F8.
4. F9–F11 as editing passes.
