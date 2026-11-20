# Round 4: independent review

Status: advice. Everything here is proposed. Reviewer: Opus, did not build round 4. Revision `5c0bbad8` on `flow-rewrite`. Nothing in the prototype, suite or design was changed; experiments ran from the OS temp folder under `conformance/watch.ts`, one process at a time, peak 305 MB.

**Verdict.** The lane, the fence, `Phase`, D3's queue and purity hold again: nothing of mine broke one Attempt per record, and the deep-freeze rerun is clean. The round's headline claims do not hold as written. **D57's one gate is true where SEARCH-ODD looks and false next to it:** a follow-up returning nothing, an event named `constructor`, a `predicts` returning nothing and a stored frozen ending of a removed operation each stop the Runtime or the store. **D58 and D59 fix writes that carry a response and miss writes that do not**, which is the real desk's delete, archive and mark-read: H1 and H2 of round 3 reproduce on that shape, and a confirmed delete comes back. **"Old code stopped producing Highs" is false:** 2 of my 9 Highs are in rounds 1-2 code, and two more lose a completion. **The spike's seam shape is right, its proof is not:** one read answer disables the session module, a leave and return during a slow close leaves a placed feed dead, and 0 of my 9 spike mutants died. D60 treats a version as a later addition, while the converted desk and Checkout code already declare `version: "revision"` on their entities. Most fixes are hours. Do not start the rest of streams until items 1-5 below are done; D60 must be settled before `listen`.

Evidence marks: **[ran]**, **[read]**, **[estimate]**. Age tags: **r1-2**, **r3**, **r4-fix**, **r4-spike**.

## Reproduced

| Item | RESULTS says | I got |
| --- | --- | --- |
| Scenarios | 357/357, 9 s, 223 MB | 357/357, 8.9 s, 215 MB [ran] |
| SEARCH-PAY, depth 8 | 22,002, 25 classes, 0 unpinned | 22,002, completed, 63 s, 218 MB [ran] |
| `pay.fixed.ts`, depth 8 | 6,774, 8 classes | 6,774, same witnesses read from `search-payFixed.txt` [ran] |
| SEARCH-ODD, depth 4 | 2,229, 145 s, 250 MB | 2,229, 148 s, 233 MB, no failure [ran] |
| **Deep-freeze, not run by the builder** | not run | World, inputs and outputs frozen around every step: 357/357; SEARCH-FRAG depth 7 complete (29,086 states at 60 s); SEARCH-CROSS depth 5 complete (36,610 at 60 s); no failure. **Pure on what ran** [ran]. Frozen plain objects only; sessions' cases are among the 357 |
| Lines | 4,412 and 475 | 4,412 and 475 by `wc` [ran] |
| Builder mutants | 35/42 | `mutants-builder.txt` says **34/42** (L1) [read] |
| My session search, new | no SEARCH-SESSION | Rooms and desk feed, oracles below, depth 2 complete, stopped by my 120 s limit (537, 827 states); 300 random walks of 12 steps each, including odd frames, reload, dispose: no failure [ran]. Slow per state, about 7/s. Instant closes only, so it cannot see H7 |

**My mutant kill rate: 24/40 raw, 24/39 (62%) with one equivalent removed.** Written from rule text before opening `mutants.ts` or `mutants-builder.*`, using `mutate.ts`. Disclosure: I had read RESULTS, which names seven builder mutants, and round 3's survivors. Two of mine overlap in spirit what I had seen (`r6-exit-abandons`, `r54-thaw-tells-restored`). **By part: core 24/30 (80%), spike 0/9.** Series 20/31, 26/36, 35/50, 18/30, 24/39. Flat overall. Core's 80% is the best number in the series, on one reader's set.

Survivors: `r54-facts-before-reset`, `r54-restored-also-when-parked`, `r51-commit-other-path` (FRAG-07 tests it only under `reject`, where the lane's own decline hides it), `d26-capture-plain-write`, `r15-fill-may-leave`, `d57-frozen-timers-unchecked`, and all nine spike ones in H9. Equivalent, removed: `r32-clears-unresolved-older` (D3: an older unresolved Attempt blocks the send, reasoning). `e18-prediction-over-nothing` died by crash, which `mutate.ts` counts as a kill; I did not look further.

---

## High

### H1. D57: values SEARCH-ODD does not try stop the core. Fourth appearance of the class. **r1-2**

"A value from outside may not name, shape or stop the core." SEARCH-ODD has one fixture and feeds lists, a subject, write answers and five corruptions. It has no follow-up, no event name and no `predicts`.

| One step **[ran]** | Result | Where |
| --- | --- | --- |
| A follow-up closure returning `undefined` (`m => m.x ? {...} : undefined`) | **Fatal**: `item.event.tag` | `turn.ts:1143`, outside any attempt; nothing gates the closure's result at `finish` |
| `send` with tag `constructor` or `toString` | **Fatal**: `{} is not iterable` | `n.on[ev.tag]`, `turn.ts:205`. A prototype name is truthy |
| A follow-up whose tag is `constructor` | **Fatal** | same |
| `to: ["constructor"]`, `to: ["__proto__"]` | **Fatal** | `kidAt` reads `kids[p]`. D57's `Array.isArray` admits it |
| `predicts` returning `undefined`, `5`, or `[null]` | **ModuleDefect**: entities off for the session, later writes decline `ModuleDisabled` | `entities.ts:333`. `carriedOf` checks reads and confirms only |
| A server failure `{ _tag: "constructor" }` | Silent. Mapped to `Object`, delivered as no event, **no `UnmappedEnding`**, no owner told. `Weird` raises the issue | `mappedFor`, `failure[e.tag]`, `byReason[e.reason]` |

An event tag normally comes from typed code, so `constructor` is a narrow reach; a wire-forwarded event or a server `_tag` is the path. The follow-up and `predicts` cases are ordinary closures with a missing `return` branch. **Implication:** the gate is a list of call sites again, the root cause D57 named. Every lookup of a user string in a plain object is a new hole: `on`, `kids`, `ops`, `outcomes`, `machines`, `records`. **Proposal:** null-prototype tables or `Object.hasOwn` for every such read, built into the compiled form; gate an `Ev` where it enters mail; shape-check `predicts`. Then widen SEARCH-ODD by machine, not by value: it needs a fixture with every closure kind.

### H2. A stored frozen ending of a removed operation is Fatal at the thaw. H3 of round 3, moved. **r4-fix**

`validInc` checks that `frozen.parked` is an array and nothing about its items. **[ran]** A read in flight at a freeze, a release that removes that read, a reload: boot is fine, `Back` is **Fatal** (`op.outcomes`, `mappedFor`). With `parked: [null]`: **Fatal** at the same step. Removing an operation is the ordinary deploy D57 exists for, and it now kills at a later, less visible moment. The next boot comes up, so it recurs at each thaw.

Restore also reads names through the prototype: **[ran]** a stored `machine: "constructor"`, `machine: "toString"`, or `op: "constructor"` is Fatal on every boot. Corruption only, the same fix as H1. A stored `ext` is unchecked as well, so a module's saved value of no shape reaches `restored` [read]. `validLane` does not check `id` against `laneKey(actor, op, key)`: a record whose id differs would let an `idle` guard pass beside a hold, a second charge's shape, should a release ever change key encoding [read].

**Proposal:** validate parked items, and map a removed operation to evidence or rule 46's `orphaned`.

### H3. Writes with no carried response: round 3's H1 and H2 again, and a confirmed delete comes back. **r1-2**

D58 moves `changedAt` in `carry`. Line 200's "predicted and not carried" branch writes `base` and does not move it. `predicts` with nothing carried is common in real code: `Attachments.remove`, `Comments.remove`, `Comments.markRead`, `Ticket.archive`, `Roster.remove` are all `write(x).predicts(...)` with no `.one`. **The suite's Issues `remove` has a `confirms` the real ones lack.** Same fixture, `confirms` removed **[ran]**:

```text
Load, truth; Toggle true (wire); Load (out); like apply; list answers old rows
before the answer: liked true, unconfirmed [liked, likes]
after:             liked false, uncertain false; repairs 0; server liked true          <- H1

Toggle true; lost; repair truth (not there); ReconcileLike; like apply
after:             liked false, uncertain false; no request open; server liked true    <- H2

Delete i1 (hidden); remove apply
after:             the record is back, uncertain false; server has deleted it
```

All three are told success and unmarked. The second has no read coming. Design 2.8.6's success row keeps omitted fields as `unconfirmed` and lists a repair, "answers from both bases", that the prototype does not run. **Proposal:** a success moves `changedAt` whatever it carried; a re-send's success with nothing carried and no live prediction is doubt; a predicted remove on success stays removed. About 10 lines. The fixture pass must copy real domain writes, not only real traits.

### H4. One read answer disables the session module. **r4-spike**

`onSent` sends `{ k: "answered" }` through `inputAll`, to every module. `sessions.input` treats what it does not recognise as a timer: `p.key.slice` throws. **[ran]** A machine with any `lookup` and `uses: ["sessions"]`, first success: `ModuleDefect sessions.input`. It disables streams for all machines. The module need not be used by the machine that read, only registered.

No spike fixture has a read. **This is exactly the price RESULTS names for no hook** ("an untyped door; a module narrows its own union"), reached on the first app that has both. One line to fix, and it says the door needs a typed `Told` with an unknown case, or two doors.

### H5. A persisted actor's rebind never adopts its fragments' lanes. A completion is lost until a reload. **r3**

`startRoot`'s retired branch calls `startActor(tx, rec)`, which is `adoption` of the root only. Rule 54 lists "the actor's rebind or restore". The fresh branch walks `started`; this one has no such walk. Trait with a write, persisted **[ran]**:

```text
Go (wire, acked); dispose; answer ok (parked, correct); ensure
got: []      waits: parked:put        expected ["ok:a"]       after a reload: ["ok:a"]
Same, answer lost:  got: []   waits: parked:put, held:put     no Restored, a hold with no owner
```

The kid is alive and bound, so the parked ending has no next adoption. Rule 45's "every hold has an owner" fails until reload. Root operations are fine (FRAG-08); no scenario has a fragment's. **Proposal:** walk the tree in the retired branch.

### H6. Queued commits behind a parked hold vanish at a reload. A sibling of the second-boot bug. **r3, kept by r4-fix**

Round 4's fix for "a hold lost at a second boot" sits in `if (ownParked) { ...; continue; }`, and `continue` skips the loop that ends `l.w`. `base` has `w: []`. **[ran]**, `serialize`, resumable trait:

```text
Go; ack; Go (W); Away (frozen); answer lost (parked, held); reload; Back
waits after reload: parked, held. W gone.   mints 2, endings 1.   got: [unsure:a:NoResponse]
control, no freeze:                         got includes no:a:Restored
```

The second commit never ends: rule 17's "every commit ends once" and C2. `checkEndings` cannot see it, because no evidence names it. **Implication:** the oracle counts endings owed from evidence, so a commit that silently disappears owes nothing. **Proposal:** run W's loop on that path; add an oracle, every minted Attempt ends or is live.

### H7. Level-triggered lifecycle is not level-triggered. A placed feed can be dead with no sign. **r4-spike**

`tell` fires on an actor change only, and `onActors` skips an id already present. A thaw has the same incarnation and activation, so the same session id. **[ran]**, Rooms with a `Stream.ensuring` whose close takes time:

```text
Away (Releasing); Back: wanted, but the id is present, so nothing starts; scope closes: dropped
row undefined, 1 connection ever, state TAB. Two minutes later: the same. Overdue path: the same.
Any later turn of that actor: reconnects
```

RESULTS states "predecessor wait ran only for instant closes". The fake's close is synchronous, so SPIKE-04's `one-connection-at-a-time` cannot fail (`r70-no-predecessor-wait` survives). A real close is a socket handshake and awaited finalizers. **Implication:** a session is a function of the tree only if something re-evaluates when the *module's* state changes too. D63's sentence needs a second trigger: `closed` and overdue re-run the wanted set for that actor. **Proposal:** that, and the fake gets a slow close by default.

### H8. D60 reasons from "a frame has no start" and ignores the version the real code already has. **r4-fix**

Convergence-4 lists `version` as option C: "a real addition", for later. Real code: `version: "revision"` on Comments, Ticket, Roster (3), Attachments, Cart (3), Refunds [read]. `feed.domain.ts`: "Versions decide duplicates and reorders". Design 2.8.6: "With versions, the version decides". 2.8's table holds "confirmed fields, versions, positions". So positions are the fallback, and the prototype's `Rec` has built only the fallback, with no fixture carrying a version. That is a flattening nobody listed.

D60's option B on its merits [reasoning, `listen` not built]: a frame sent before a write lands and arriving after its success applies with no mark. That is H1's trace through a third door, and contradicts D59's stated rule, "no silent wrongness". "Order, not a start" holds inside one connection only. Two connections for one record (a list feed and a detail feed, or across a reconnect) have no joint order. A frame can also be older than a read already answered. Option A's objection ("defeats a feed") is a strawman: doubt could apply only to a differing frame while a write's echo is outstanding. And a live feed never clears a doubt, so a failed repair stays marked beside frames that have since overwritten the field.

**Sync engine:** D58's comparison sits in entities, not in the seam, so an engine can bring its own. That part fits. But txid and LMID are versions, so an engine needs what entities should already have. **Proposal:** D60 becomes: version where the entity declares one, for all three kinds of evidence; D58 only where it does not; a frame on an unversioned entity with a confirmed write unechoed doubts. About 30 lines [estimate]. **Owner's question, restated.**

### H9. The spike's cases do not test what it claims. **r4-spike**

Nine mutants from T1-T4 and rule 69-70, nine survivors **[ran]**:

| Mutant | Rule | Why nothing failed |
| --- | --- | --- |
| `t1-wipe-unchecked` | T1 `connect`: wiped reads as owed | SPIKE-02's "a-wipe..." checks `filled` only. `fills` is S15's hard part, and no reconnect after a wipe runs |
| `r70-no-predecessor-wait` | Rule 70 | Instant close (H7) |
| `r69-two-in-mail` | T4, "at most one in mail" | `do()` settles per frame. `values-in-order-one-in-mail` **cannot fail** |
| `t1-member-values-keep-moving` | T1: a member stops queued values | Queue always empty |
| `t1-member-notice-at-tail` | T1: "at the queue's head" | Queue always empty |
| `t2-row4-proof-always` | T2 row 4 | No first-open proof |
| `t1-healthy-no-reset` | T1 `healthy` | Nothing asserts a later backoff |
| `t3-denied-position-kept-missing` | T3: `v[position] ?? at` | No value without a position |
| `t1-idle-not-armed-on-value` | T1: value re-arms | No silence after a value |

So "ran with no new hook" is a true statement about the seam and a weak one about sessions. RESULTS' THIN mark is honest; its "T1-T4 ran" is not supported. M3-M7 below are bugs in those lines.

---

## Medium

- **M1. Boot writes away what it has only in mail. r3.** A headless lane's parked endings, and W, are removed from disk by boot's own flush while their endings exist only in mail. **[ran, `step` directly]** boot, apply the writes, boot again with no turn between: parked ending, mail 1 then **0**, lane record gone; acked head with W: mail `att-1, att-2`, then `att-1`. A crash during recovery loses them. L7's class, wider than stated. Narrow window; repeated boots are when pages crash. Proposal: delete on delivery, not on restore.
- **M2. A `.each` reset in a pending-reset follow-up does not reseed. r3.** `runRecheck` has no `applyLists`. **[ran]** A callback's patch moves the reset value: after the follow-up, copies 0 with the list non-empty, until any next turn. Non-`each` control reseeds. Also the boot path.
- **M3. A failure delivery reaches the machine after its session was released. r4-spike.** `release` retracts `inFlight` only, not `#end`; and the deliver fence is by incarnation, while rule 70 says activation. **[ran]** No reconnect, stream ends, `SignOut` ahead in mail: turns `SignOut, FeedEnded`; memory `endedElsewhere: true`; no `Discarded`. This also answers `seam-deliver-unfenced`: the fence is reachable, and it is too coarse. RESULTS' "cut candidate" is wrong.
- **M4. `wanted` reads `input` on every change, and a later throw releases a live session. r4-spike.** Rule 68: "reads `input` once, at start". **[ran]** A closure that throws once memory changes: connection closed, row gone, state still LIVE, one `UserClosure`. D46's default became "stop streaming". T9's plan disagreement is larger than RESULTS says.
- **M5. `end` drops queued values with no evidence. r4-spike.** `queue: []`. **[ran]** a, b, c, end, no reconnect: memory `[a]`, `discarded: 0`. T9: `failure` behind queued items. Rule 8.
- **M6. `lastReset` is never cleared. r4-spike.** **[ran]** reset to `2:0`; value moves to `2:5`; drop; reconnect unproven: bookmark back to `2:0`, next connect asks from there. Duplicates, not loss; an unbounded replay on a long feed.
- **M7. A bookmark member writes `filled: true` whatever the field. r4-spike.** T3: "`filled` = field not empty". **[ran]** Signed out, empty field, `Jump` to 9, `Open`: saved `{ at: 9, filled: true }`, then `connect` sees a wipe and opens from nothing. The jump is lost.
- **M8. Doubt can stay forever. r4-fix.** A doubt goes only by a read or repair of *that ref*, and a failed repair does not retry. **[ran]** Doubt; repair fails; an hour; the list no longer holds the record (another device deleted it): still `liked: true, uncertain: true`, until reload. Marked, so not silent, and it wedges nothing: no write waits on doubt [read]. D58's table says "A later read clears it", and there may be none. Reload clears everything, since the slice is not persisted. Rule 32's given mark has the same life, by design.
- **M9. Budget: the count is honest, the projection is low, the cut is wrong. r4-fix.** 4,412 reproduced. `sessions.ts` is not in it but is in the projection. RESULTS calls the spike "about a third" of T1-T9, so 1,425 by its own ratio, past its midpoint of 1,300; and what is left is the harder part: Repairing and pages, T5, T6, T7, Flapping, `while`, tagged failures. S5 estimated T1-T4 at 176 lines and it cost 475. **Streams 1,500-2,200 [estimate]**, versions and `basedOn` add to entities' remainder: **midpoint about 10,800.** On the cut, against the converted code [read]: **`activities`' `when` has 9 real uses** (Comments three, customer card, queue, roster, editor) and level-triggering makes it about 10 lines. **Take it off the list.** `allow`: 3 contracts, all fire-and-forget; a per-call key and `reject` is near. A fair cut. `cancel`: Assistant's Regenerate and Pay's shipping quote, both interrupt on the wire. `latest` waits for the wire, so "`latest` with a key-less cancel" changes those handlers and adds a hold to release. Costly to the reader. Keyed schedules: editor and queue; the editor already has field copies, so `.each` is plausible; queue not checked. **So `allow`, then keyed schedules, is about 200-300, not 350-600 [estimate]. It does not reach 10,000.** The owner should see that now. Dropping the 14 KB target: agreed, it never had a reason. 18.7 KB not rerun.
- **M10. `pay.fixed.ts`: Pay, plus one fake limit; not storage. r4-fix.** RESULTS' "7 from a void refused by storage" names the shortest witness, not the root. **[ran, copies, depth 8]** Retry the void on `StorageRefused`: the witness moves to `... void.captured Start`, 7 classes remain. So any void that does not finish reaches it. **One guard instead, `Start` denied while `authorized` and no receipt: all `charged-unaccounted` gone. 4 classes left, all `... place.ok Start PayRequested`**, same-intent `Start` after an order, which is the fake (Stripe refuses). So: **Pay, a one-line guard, and the fake.** Not the runtime, and no case for a memory redesign. Its cost is product: a shopper with a stranded hold cannot start again. A narrow design question remains: `persisted` is per machine, so a compensation cannot go out when the disk refuses. Say so; do not build.
- **M11. Pins and oracle. r4-fix.** "Pins name the steps" is partial: `charged-unaccounted` via `/Leave/` and `two-keys-one-intent` via any two `PayRequested` are still wide (`pay.search.ts:134-139`). `moneyAudit` counts `mine && m.authorized === true` as accounted, so a hold stranded in `LEFT` passes until `Start` clears memory: the oracle reads the machine's belief, which its header says it does not.
- **M12. "No new hook" is literally true and measures nothing. r4-spike.** `input` now carries `actors`, `turned`, `member`, frames, closes, timers, `answered`. Those are hooks with a tag, plus `observes`, 4 `Cx` methods, one mail kind, one member kind. H4 is what that costs. `cx.actor` hands out core's `Inc`, and `sessions.ts` imports `fragOf`, `up`, `viewOf`, `walkIncs`. `wanted` restates placement: which nodes are active, what a frozen slice means. Seam's header says a module "holds no world". **Is `sessions.ts` doing core's job?** About 20 of 475 lines, `wanted`, are; the rest is T1's table and belongs there. Fine for one module, but a sync engine should not need the tree. **Honest count: 12 hooks, one with about 7 meanings.** I would still keep one door, typed, and move `wanted` behind a core helper, "active activities of this actor".
- **M13. T3's "plan wrong" is a misdiagnosis. r4-spike.** Design separates `disposeActor`, which removes the record, from retain expiry and "awaiting reload", which keep it (2.7.13). T3 and T9's "new memory" read as the former. The prototype has one dispose, the second. No conflict shown. **[ran]** And restore makes every saved identity live: an actor disposed before a reload has an open connection afterwards, with no `ensure`. One saved record, one socket, one schedule at boot. Decide with persistence.
- **M14. Real shapes: what is still flattened. r4-fix.** Beyond each fixture's own note, and unlisted: predicts-only writes (H3); entity versions, `basedOn` and its rebase (H8); `.alsoChanges` and field functions on another record; `.one`'s `PredictionNotRetained`. Desk feed: failure by tag (`SignedOut: E.SessionExpired` is the real way out), `reconnect.while`, `Healthy`'s `bothLive` (rows in a guard's view), two sessions, `.slice(-ACTIVITY_KEPT)`, `subscribe.each` and `when`. `Room` is invented, though fairly. `activitySignals` is as written [read]. `real.compiled.ts`' Address, Resolve, Upload and History did find bugs and survive my reading of what I sampled; that part of H7 is real progress.

## Low

- **L1. r4-fix.** RESULTS: 35/42 with seven survivors. `mutants-builder.txt`: 34/42, eight (`seam-no-retract` and `l6-fire-touches` are not both accounted for). RESULTS also says L5 has no reaching scenario, while `l5-parked-in-lane-order` died by 5 cases.
- **L2. r4-spike.** `"__threw__"` as a throw sentinel in `pump`: a mapper returning that string ends the session.
- **L3. r4-fix.** `canon`: `NaN`, `Infinity` and `null` are one key; `undefined` and a function are one; every `Map` is `{}`. So two lanes can be one [read]. Partly stated.
- **L4. r4-spike.** A `BigInt` in `restartAt` or `head` is not gated: `UnencodableValue`, and the actor's record stops saving until a value moves the bookmark [ran]. Stuck on a feed with no position [read].
- **L5. r4-spike.** `pending` for an incarnation ended in the same turn stays in the slice forever [read].
- **L6. r4-fix.** The L6 fix is partial: a fired timer is off the world, so any other write of that actor before its turn drops it from the record [read]. L5 and the old-connection fence: agree with RESULTS, the fence looks dead until T6's drain [reasoning].
- **L7. r4-spike.** `lose` keeps moving values when one is in flight; T1 says discard [read].
- **L8. r1-2.** `ensure` of an unknown machine is Fatal [ran]. A typed call; a one-line gate.
- **L9. r4-fix.** Positions restart each boot. Safe only because the slice is not persisted: cache or SSR hydration must carry or rebase them [reasoning].
- **L10. r1-2.** No gate on a large `ms`: `setTimeout` past 2^31 fires at once in a browser [reasoning].

---

## Counts by age

| Age | High | Medium | Low | Total |
| --- | --- | --- | --- | --- |
| r1-2 | 2 (H1, H3) | 0 | 2 | **4** |
| r3 | 2 (H5, H6) | 2 | 0 | **4** |
| r4-fix | 2 (H2, H8) | 5 | 4 | **11** |
| r4-spike | 3 (H4, H7, H9) | 7 | 4 | **14** |
| **All** | **9** | **14** | **10** | **33** |

**On the builder's "the core is converging".** Half right, and the wrong half is the reassuring sentence. Step, fence, `Phase`, lane table, D3 and driver: no finding of mine, and 80% on core mutants. That part is converging on what I tried. But "old code stopped producing Highs" came from checking the review's Highs for old constructs, which looks only where a reviewer had looked. H1 and H3 are round 2's lines, and they surfaced because I fed them inputs nobody had. H5 and H6 are round 3's, one kept through a round 4 fix. Evolving rather than rewriting means this code was not re-justified, as you feared. The fair reading: **the lane core is stabilising; the gate and the entity module's confirm path are not.** Counts also track where I looked, so they cannot prove convergence. New-code rate is still high: 25 of 33 are this round's.

## Round 3's findings, really fixed?

| Finding | State |
| --- | --- |
| H1 | Fixed for writes that carry a response [ran]. **Renamed: H3** |
| H2 | Same. **Renamed: H3** |
| H3 | Fixed for leaf, frag, kid, timer, lane [ran: REV4-H3, my mutants]. **Renamed: H2** |
| H4 | Fixed for its rows. **Renamed: H1** |
| H5, H6 | Fixed [ran: SEARCH-ODD's keys; `r6-exit-abandons` killed by 4] |
| H7 | Real progress in traits; domain writes and the spike still thin (M14, H9) |
| M1 | Fixed [read: `then` only if the queue took it] |
| M2-M5, M7 | Fixed on what ran; builder's mutants kill them. I reran none by hand |
| M6 | One format [read]. Prototype names silently bypass it (H1) |
| M8 | Answered by a spike; M12, H4 |
| M9 | Partial (M11) |
| M10 | Applied at last; root misnamed (M10) |

## Spike against the design for streams

Testable: bookmark on `Inc.partition` is right, and D62 is the best thing in the spike: atomic with memory on a reload, frozen with the slice, gone on reset [ran]. Rule 69's one-at-a-time and T3's position move fit `input` and `deliver`. Form A holds. **By reasoning only:** `catchUp` and Repairing fit as more T1 states, but `buf` and page reads need `abandon` commands, so they add to the door. `latest` needs `reconcile` at a turn's end and a slot check at admission, which `deliver` cannot express: it needs retract-by-slot, or a new mail check. `listen` needs T7's registry of answered reads, which does not exist, and H8 first. Overflow needs T6's pull, and the current driver runs `Stream.runForEach` with synchronous `input`: **no backpressure, so T4's "pulls at turn pace" cannot be built on this `exec`.** That is the largest risk, as RESULTS suspects. `ReleaseOverdue` ran in my probe and hits H7. T9's "a `when` throw refuses the turn": level-triggered cannot; I would accept that loss, and M4's default should be "keep the session, issue", not release.

## What round 5 must decide, in order

All proposed.

1. **H4, H5, H6, H3's three cases.** Hours. No design.
2. **H1, H2 as one rule:** no plain-object lookup by outside string; gate `Ev`; validate `frozen.parked`; widen SEARCH-ODD by closure kind.
3. **H7:** second trigger for `wanted`; slow close in the fake. **M3-M7** with it.
4. **H9:** queued-state and wipe scenarios, a SEARCH-SESSION with a slow close, an "every mint ends" oracle.
5. **M1, M2.**
6. **H8, owner:** version first, position as fallback. Before `listen`.
7. **T4's pull:** a thin spike of a pulled source through `exec`, before the rest of streams. Then streams may start.
8. **M9, owner:** the stop. The named cut does not reach it; `when` should leave the list.
9. **M10:** apply the guard; no memory redesign. Product cost to the owner.
10. **M13:** which disposes exist; does a boot wake every saved identity?

**Should the rest of streams start?** Not yet. 1-5 are small, and 6-7 decide its shape. The seam's shape stands: nothing here argues against Form A, D62 or one typed door.

## Not checked

- `real` browser, `fetch`, IndexedDB, Node, phone; `nub run verify`; lint (RESULTS' 822 errors); bundle sizes.
- SEARCH-CROSS and SEARCH-LIKE past what is above; SEARCH-FRAG unfrozen; SEARCH-PAY past depth 8. My session search reached depth 2 only, plus random walks.
- `allow`, `cancel`, keyed schedules, `check()`: not built. Streams beyond the spike, sync engine, D60: reasoning. No frame was ever applied; H8 is a reading of its text.
- Real usage counts are by `grep` over `features/`; queue's keyed schedule, Assistant and presence not read in full. Citation sampling was thin: REV4 and SPIKE groups and the log's tail, not every rule cite.
- My mutants: one reader's 40, `mutate-one.ts`'s default searches only. Builder's list not rerun.
- `constructor` as an event, and corrupt stored names, are narrow reaches: I rank H1 by the class and the follow-up and `predicts` cases, not by those. H3's confirm-less `like` is a variant of a fixture; the real shape is its `remove`.
- M1 uses `step` directly with hand-written records, modelling a crash the fake's `reload` cannot reach.
