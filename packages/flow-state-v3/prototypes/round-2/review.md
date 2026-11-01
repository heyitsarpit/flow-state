# Round 2: independent review

Status: advice to the coordinator. Everything here is proposed. Reviewer: Opus, did not build round 2. Revision: `ab0da1e1` on `flow-rewrite`. Nothing in the prototype was changed; experiments ran from the OS temp folder or on scratch copies, under `conformance/watch.ts`, one process at a time.

**Verdict.** The step, the fence and `Phase` hold, and the step is pure on what ran. Do not start fragments on this yet. "No runtime bug was found" does not survive: a restored Attempt can be told "never sent" (money), one bad record or one user value kills the Runtime on every reload, and a disabled store silently lets writes pass an unresolved one. D41's cut breaks on a replayed response. An independent mutant set still loses about a third. Five of the six Highs and most Mediums are fixes in `lane.ts`, `hooks.ts`, `durable.ts` and the oracles; the module seam is the part that needs a real redesign before streams.

Evidence marks: **[ran]** I ran it, **[read]** I read the code or text, **[estimate]**.

## Counts

| Item | RESULTS says | I got | |
| --- | --- | --- | --- |
| Scenario cases | 120/120 | 120/120, 0.4 s, 132 MB [ran] | reproduced |
| Same, world and inputs deep-frozen after every step | not claimed | 120/120 [ran] | purity holds |
| SEARCH-PAY depth 8 | 18,374 states, 50,567 edges, 26 s, 208 MB | 18,374, 50,567, 25 s, 210 MB, 25 classes, 0 unpinned [ran] | reproduced exactly |
| SEARCH-LIKE | depth 9, 183,828 states | depth 7 only: 44,376 states, 26 s, no oracle failed [ran] | consistent; depth 9 not rerun |
| SEARCH-PAY on `pay.fixed.ts` | 17 unpinned at depth 8 | 17 [ran] | reproduced |
| Core + driver + entities lines | 2,500 | 2,500 [ran] | reproduced |
| Core gzip | 9.4 KB | 9.4 KB, 9,413 bytes [ran] | reproduced |
| S4 | under 8 ms at 6x | rerun with the event RESULTS blames for the hang: same order, finished in 7 s [ran] | numbers hold; see L1 |
| "No runtime bug was found" | | H1, H2, H3, M1, M3, M7, M8 | **overstated** |
| "Phase removed H3's class" | | H1 is that class, through `sends` | **overstated** |
| "Citations with a killing mutant 74/78" | | true as counted; rules 15, 27, 44, D1, D40 are "proven" and each has a surviving independent mutant | **misleading** |

**My mutant kill rate: 20/32 raw; 20/31 (65%) with one equivalent removed.** Written from rule text, one process each, scenarios then the search. Disclosure: before writing them I had seen 13 survivor names from the builder's lists in a grep, not the lists. Round 1's figure was 2/16; the builder's second author got 26/36 (72%). The improvement is real and the number is not yet good.

---

## High

### H1. A restored Attempt counts as "never sent". Code wrong, plan right. Money

`round-2/lane.ts:127`: `return h.sends === 0 ? "Waiting" : "Resend"`. `sends` is what storage last heard. The design says the opposite for a restored Attempt: an acknowledged one restores unknown "even if it was acknowledged but never invoked: the Runtime cannot know whether invocation began" (2.7.13 restore row, G1). `invoke` also sends the request before the plain capture of `sends: 1` lands, so a crash between them leaves `acked: true, sends: 0` on a request that went out.

After a retry of such an Attempt, every "by history" cell picks the never-sent side:

**[ran, real Pay, no edit of storage]** `pay, landNoAck, reload` gives UNSURE, `unknown { Restored }`. Then `advance 3000, order null, intent requires_payment_method`, `storage refuse`:

```text
state CARD   ending failure:StorageRefused   notice "Your payment wasn't sent. You haven't been charged."   row undefined
```

In that trace nothing was charged, because the fake cannot lose the capture. The next three lost the capture by hand, with the request applied at the server:

**[ran, persisted Issues, lane record set to `sends: 0`, request applied at the server]**

- `retry, cancel`: `failure:Cancelled`, toast, lane gone, server `liked: true`. The next later success leaves `uncertain: true` for good: the mark's Attempt no longer exists, and nothing clears it.
- `retry, commit`: `Superseded` for the applied Attempt; the new write is sent past it. S5 and rule 17 are both broken. Record stays `uncertain` after the new write succeeds.
- `retry, refuse`: `failure:StorageRefused`, row gone.

It is M3 and H3's family, back through a field `Phase` did not cover. SEARCH-PAY cannot see it: S6 treats `lastChannel === "failure"` as resolved, so it trusts the very ending that is wrong. Pay's `told-not-charged` class also needs a real charge, and that class is pinned to P6 anyway.

**[ran]** My search below finds it in 5 steps, 2 s: `commit, landNoAck, reload, retry, commit`.

**Proposal.** `Waiting` needs `sends === 0 && !mayHaveApplied`. **[ran on a scratch copy]** that one line removes this failure in my search. Add "once unknown, never a definite ending and never Superseded" as a search oracle.

### H2. D27's "reload recovers" is false for the case its own reason describes. User data is fatal

D27's reason: a core bug "is deterministic and would repeat", so go fatal and let a reload recover. A deterministic throw on persisted data repeats after the reload too.

**[ran, each boot twice]**

| Trace | Every boot |
| --- | --- |
| A lane record that does not parse (`step.ts:184`, `JSON.parse` inside the step) | `Fatal: SyntaxError` |
| A saved lane naming an operation this release removed (`turn.ts:37`) | `Fatal: TypeError ... op.outcomes` |
| A saved actor of a machine this release removed | `Fatal: TypeError ... machineOf(tx, a).ops` |

The tab can never write again until storage is cleared by hand, and the Runtime has no way to clear it. Rule 46 and PERSIST-02 want the opposite. An ordinary deploy reaches the second row.

User values reach it too, because core encodes what closures return, outside `run`:

**[ran]** A key closure returning `{ id: 10n }`: `JSON.stringify` in `laneKey` (`world.ts:230`), `Fatal`. A `BigInt` in a persisted machine's memory: same, in `encodeActor`. So one odd value kills all actors' writes. It is a user error and should be `InvalidTurn` by D11.

`PAY-17/core-throw-is-fatal` passes because its fault is **one-shot** (`coreThrows` counts down). It tests the one kind of core throw D27's reasoning says does not exist.

**Proposal.** (a) Restore is per record: an undecodable or unknown record is quarantined with an issue and the rest boots, as PERSIST-02 will need anyway. (b) Encoding a closure's value belongs inside the turn's attempt, so it refuses the turn. (c) Fatal stays for real core bugs, and on the next boot a record that killed the last boot needs some answer.

### H3. D27 fails open: a disabled store drops record ordering silently, and a user closure can disable it

**[ran]** A `confirms` mapper throws once on a response shape it did not expect:

```text
issues [ModuleDefect entities.settled]   fatal false
Edit then Toggle from another actor: rename att-1-2 and like att-1-3 both on the wire for record i1
record stays predicted:true with a frozen slice
```

**[ran]** With a like held unknown and another actor's write behind it, one throw in `blocks`: the later write goes on the wire past the unresolved one. S5 says this must not happen, and the design has no exception.

`entities.ts:125` and `:218` call user closures raw, so a user's error is reported as a "module defect" and the blast radius is every record for the session. Moving them to `cx.user` does not help: `hooks.ts:64` rethrows `Refused`, `onSent` has no catch, so it escapes the step. **[ran on a scratch copy]** `confirms` through `cx.user`: `Fatal`.

`DRV-03/a-disabled-store-frees-its-queue` and `a-disabled-store-blocks-nothing` pin this as expected, with no `pins:` mark. `PAY-17`'s four `hook-throws-*` cases disable a fault module whose `commit` does nothing, so they cannot see what disabling costs.

Convergence's table does say "no record ordering for the rest of the session", so the owner was told. It presents that as availability. By the priority order it is correctness.

**Proposal.** Fail closed: while a module that holds entries is disabled, any Attempt that joined or would join it stays unsent, or new ones decline with an ending. Writes of machines not using it continue. And settle what a user closure's throw at settlement means: there is no turn to refuse. My lean: a confirm's throw ends the prediction and forces a repair, an issue with the origin named, and the store lives.

### H4. D41 breaks: a replayed response overwrites a newer value, silently, with no second write in the Runtime

D41's reason: no newer write passes, so "a re-send's response cannot lose by position". That only looks at writes in this Runtime. E7's case is a value newer than the response, and a read delivers one.

**[ran, as-built fixture and fake]**

```text
Toggle(true); answer applyLost (server applied, answer lost); repair truth          liked true, uncertain true
another device: mutateServer liked false, title "other device"; Load; list truth     record shows liked false, title "other device"
ReconcileLike; answer apply (the server replays its stored response for this key)
record: liked true, title "title i1", uncertain false, predicted false, no repair
server: liked false, title "other device"
```

The screen is wrong, the mark is cleared, and nothing will ever repair it. This is the sentence in E7, "right when the server replays a stored response", with a real consequence. SEARCH-LIKE's mint-order oracle cannot see it: it holds the premise about writes, and its fixture has no reads and no other writer.

**Proposal.** Do not keep D41 as written. The minimum: a re-send's success whose carried fields differ from the current base forces a repair. That is one comparison, and it needs no position table. It also applies to M3.

### H5. The suite still passes on these, and no search crosses the store with persistence

SEARCH-LIKE has no persistence, no reads, no `advance`, no failing or hanging repair and no storage faults. SEARCH-PAY has one actor and no store. The two features meet only in STORE-09 and REFUND-01's reload cases.

**[ran]** A search I wrote on the builder's `engine.ts`: S1 with `persisted: true`, 2 actors, 3 commits, with `reload`, `ack`, `refuse`, `landNoAck`, `advance 30 s`, repair `ok/fail/never`, late landing, and oracles R17/R18 above and rule 32 at quiescence:

| Build | Result |
| --- | --- |
| As built | **Fails in 2 s**, depth 5: H1 |
| H1's line fixed, on a copy | **Fails at depth 7**, 42 s: M1 |
| H1's line fixed, no `landNoAck` | Depth 7 complete, 134,212 states, 105 s, 304 MB, no oracle failed |

Independent mutants that survive both scenarios and search. Each is a rule with a citation or a mutant on the builder's list:

| Survivor | Rule text | Why nothing failed |
| --- | --- | --- |
| Late ending has no store effect | **Rule 27, E13**: routing never changes store effects | No scenario ends a domain write late |
| Held counts as live work for a late turn | Rule 15: "another pending" | PAY-19 never has a Held lane there |
| Restore delivers in reverse creation order | Rule 44 | No reload with two lanes checks order |
| Cancel on `Settled` releases | Rule 24: the real ending stands | No cancel between settlement and admission |
| Stale repair answer accepted | D40's fence | STORE-07 only fences with no repair running |
| `Cancelled` forces no repair | E5, 2.8.5 | No domain cancel on the wire |
| Disposal still invokes | Table: "from its start nothing is invoked" | No `ready` lane at disposal |
| W's prediction kept at disposal | Rule 30 | STORE-04/Disposed has no W |
| Prediction over an absent record shows | E18 | STORE-06's "E18 shows nothing" asserts only `predicted` |
| A carried field stays `unconfirmed` | 2.8.6 | Only a read is tested |
| Nested follow-ups FIFO | D1 | ORDER-01 has one follow-up |

The twelfth, `settlement-not-published`, is equivalent: `setLane` publishes anyway.

**Proposal.** Keep D33's rule, and stop reporting "proven" as if one builder-mapped mutant covered a rule. Add the crossed search. Oracles must not read the ending they judge: S6 should be "no new id while the server may have an earlier one", which the fake knows.

### H6. Round 1's H5 survived a rename, in one place: `hooks.ts` gives no meaning to a throw outside a turn

Every Refused route is written for a turn. `hook`, `prepareAll` and `startAll` rethrow `Refused`; only `onTurn` and `enterActor` catch it. `readAnswered`, `settled`, `released`, `restored` and `timer` run outside any turn, so the capability `cx.user` promised by D25 ("its throw refuses the turn") has no turn to refuse in 5 of its 14 hooks. H3 is the first consequence. Streams will have the same shape: a value mapper at delivery is a user closure outside a turn, and `hookOne` has no `Refused` case at all, so there a user's throw disables the module rather than refusing. [read; H3's scratch run covers `settled`]

**Proposal.** One sentence in the seam: a user closure outside a turn is an issue with its origin, its effect defaults per hook, and it never disables and never kills. Do this when H3 is decided.

---

## Medium

### M1. Given up, then back from the dead: the ack window has no fence

**[ran, search, on the H1-fixed copy]** `commit a0, cancel a0, landNoAck, commit a1, ack, a1 ok, reload`, then the drain's retry: a0's write, told `NotSent { Cancelled }`, restores `unknown { Restored }` and is sent **after** a1's newer write has succeeded. Server goes backwards with no `Released`.

**[ran]** The single-actor form: `Toggle, landNoAck, Cancel` gives "Could not update", row gone. `reload`: row `uncertain`, `unknown { Restored }`, and a retry sends it. The deletion waits behind the landed-but-unconfirmed write and dies with the process. `latest`'s replacement is the same window.

D30 closed the bound's door into M3. Cancel and replace use the same one. Section 7 item 21 knows this for a cancel. It is reachable only with a crash or a lost confirmation, and real for any store that acknowledges after landing. Pay does not cancel in this window.

**Proposal.** A cancel or replace of a never-sent Attempt whose ack is out waits for that ack before it says `NotSent`, or says it and leaves a tombstone. Owner's call; correctness first favours waiting.

### M2. D40 is consistent with D3. The cost is D3's, and it is not on the morning list

D40 is right given D3. But D3 changes rule 30's "holds the record queue until that repair settles" into "until resolved or released", and that is what makes the wait unbounded. The design's stated limit was only a queued commit in `W` at the head.

**[ran]** `Edit, rename lost, repair ok`, another actor's `Toggle`, `advance 1 hour`: like never sent, B's row `pending: true`, no issue, no new evidence kind but `lane`, `mint`, `turn`, no timer. Only `waits()` names it. (This fixture's `RenameUnsure` only toasts; the design's cancels, `machine-design.md:2910`. So this needs a machine whose owner is a person who has not pressed. Pay's UNSURE poll is not one.)

The bound is D15's, for an unbound hold only, and D15 is not built. **[ran]** A lane record whose actor record is gone: `Held`, `unbound` evidence, no issue, later writes to the record wait forever, and D29 passes it.

S1's evidence for D3 is strong and I do not propose flipping it. Cross-actor stalls need to be visible: a `RecordHeld` issue or evidence once at a bound, naming holder and waiter. And the owner should see "D3 makes the third clause and contested disappear, at this price" as one decision. D3 is what makes both unreachable, so they are not independent findings.

### M3. A read's answer has no position: a stale read overwrites a confirmed write

**[ran]** `Load` (out), `Toggle, like apply` (confirmed, server true), then the read answers its old rows: record `liked: false, predicted: false, uncertain: false`, server true. Silent. `entities.ts:223` replaces the base unconditionally.

2.7.9 relies on "OPS O2's ordering", and 2.8.6's table has "answers from both bases". RESULTS lists "Repair has no answer position" as a shortcut and does not mention reads. Streams' `filled` and `listen` need the same idea, so it belongs in the store before round 4. Also `c.fields ?? {}` turns a `removed` carried value into an empty base [read].

### M4. D30 is the right direction and half a fix

Silence must not say "not charged": agreed. **[ran]** `pay, hang, advance 1 hour`: PAYING, notice "Still confirming with your bank…", no timer, `StorageSilent` once, no issue. The request was never sent, so that sentence is false. The convergence table says "until the machine's own timer speaks", and in Pay none speaks: the 60 s timeout arms at invocation, so it cannot start. Leave still works.

A machine has no way to learn storage is silent. So either `flow check` warns on a state waiting on a persisted commit with no schedule of its own, or the row exposes it. Also, a hung head holds its record queue with no bound, which adds to M2.

### M5. D31: one throw in an unknown's handler leaves a live hold with nobody told

**[ran]** PAY-11's fault on `states.PAYING.on.PayUnsure[0].updateMemory`, once, with the charge landed: PAYING, row `uncertain`, one `InvalidTurn`, **no timer, no request for an hour**, "Still confirming with your bank…", charges 1. The fact is gone and UNSURE, which owns reconcile, is never entered. D31's reason, "deterministic, so redelivery would loop", does not cover a closure that throws once. The hold is the one ending where losing the turn loses the owner.

Bounded redelivery of an unknown (once, after other mail) is cheap; or `flow check` could refuse throwing shapes it can see. Owner's call. PAY-11 only tests a success ending.

### M6. The seam: fragments fit with work, streams do not fit as written

14 hooks confirmed. `commit` has one user, the suite's own no-op. Each item is [read] against rules cited.

| Needs | Why this seam fails |
| --- | --- |
| Deliver an event | **`Cx` has no way to put anything in the mail.** Every stream value (rule 47) needs it |
| Know activations | Sessions follow a placement's activation (T9, rule 70). A module sees no actor, and no hook fires on enter or leave. `commit` gets `(s, cx)`. Round 1's `desired` was dropped; it returns in some form |
| Stop a fiber | **`DriverIo.fork` returns nothing.** Rule 70 and T9 need an interrupt. M7 is this running today |
| Disposal | No `dispose` hook, and `wires()` counts lanes only. T9's `ReleaseOverdue` has nowhere to live |
| Flow control | Rule 69, "at most one in mail": no hook says a mail item was admitted |
| Reach another module | `listen` feeds the store (2.8.14), and write progress is a lane row (T8). Own-slice-only has no path between modules, nor a path to a row |
| Read a slice | D42 lists a `read` hook. It was not built: `adapter.ts:94` casts `w.ext["entities"]` and imports `readRecord` directly. Publication has the same need in production |

Resources: `commit` gets no Scope or context, and reads have no owner for an acquired value. Persistence: the core owns it, and it is the part that held up, but restore must become per record (H2), and actor and lane records still land independently of each other with no test of the window.

Fragments: `turn.ts` needs a rewrite, not an edit. `runTurn` moves leaf to leaf, `delete activations[a.leaf]`, `leavesWork` reads one leaf; P2-P4 are absent; `laneKey` has no subject path; `unbound` drops an ending where rule 44 parks it. None of this needs a new hook, so the step's shape survives. The seam was tested against one module, as RESULTS says.

**Proposal.** Write streams' session table against the seam on paper before round 3 changes it, as round 2 did for entities. S5's answer on where a session's state lives decides how much of this is needed. Expect 4-6 more capabilities, and try to cut hooks at the same time (`commit`, `describe` into a read).

### M7. Module fibers outlive their bound and the Runtime

**[ran]** A repair that never answers: live fibers 1 before, 1 after the 30 s bound, 1 after disposal and `Disposed`, and no `AbandonedFiber`. A real abort never fires, so a hung fetch is held for the page's life. D6's "survivors are evidence" does not reach module fibers.

### M8. A prediction's field function throws at read, not at the turn

RESULTS: "`prepare` was needed ... so a prediction's throw refuses the turn". True for `predicts`; its field functions are lazy. **[ran]** A throwing field function: turn accepted, row pending, no issue, and **reading the record throws** out to the caller. `check()` and publication will hit it. At success, `confirm` calls `applyPatch` inside `settled`, so that throw lands on H3. Rule 28's "calls its predicted fields' functions" at start (2.8.13) is not what runs.

### M9. D29 improved L3 and did not finish it

`checkClaims` catches lies about wire, storage, timers, W, mail and ready, which is a real gain. Remaining: `held` is `default:`, so it passes with no actor, no handler and no owner (M2's trace passes). `queue`/`W` pass when "behind" names anything claimed, including that `held`. `repair` accepts any open repair, not that ref's. `wire` accepts a `never` request. The `flow check` half is unbuilt, as stated.

### M10. Pay's fixes under search: mostly Pay's memory, partly the oracle, partly the fix list

**My view: Pay's memory design first, oracle second, the fix list third. Not the runtime.**

**[ran]** Same search, alphabets reduced:

| Alphabet | Unpinned classes |
| --- | --- |
| Full | 17 |
| No `hang` | 17: `hang` witnesses switch to other storage or time witnesses, so hang is not the cause |
| No `hang`, no second `Start` | **2** |

So 15 of 17 need `Start` again after `Leave` or `PAID`. Real machine: `Start` is handled in IDLE, PAID, LEFT (`pay.machine.ts:223,442,447`), so that path is reachable. With a charge in flight, `memory.intentId` and the one `authorized` bit are overwritten. That supports the builder's guess. The P5 fix is half-applied: `pay.fixed.ts` has the `idle` guard and not the "`CARD` handler for restored holds" its own table asks for, so `held-no-owner:CARD` was expected. P6's fix is not applied (stated).

Oracle: `order-no-receipt:CARD` is `Start` after PAID clearing a shown receipt, which is not lost money. `placed-and-voided` is keyed by intent while two keys authorised it. `two-keys` assumes the fake's server charges twice on one intent, and Stripe would refuse. That makes it a question about the server. Both need the ledger per key.

The remaining 2 are real: `pay, Leave, ack, pay.ok, reload` (the void's `NotSent { Restored }` has no retry, so the hold is never voided) and `pay, ack, advance, advance, intent, landNoAck`.

**Proposal.** A Pay redesign holding a set of authorisations by intent. That is the owner's. Then re-key the oracle per key, and make pins narrower than a prefix: a pin as class plus state plus a script fragment, so new bugs do not hide. "Prefix only" is RESULTS' own stated weakness.

### M11. Size: the stop was moved, and it is not on the morning list

D38 takes "Core + driver" whole-system stop from **10,000 to 12,450**, while saying "a stop is a cut, not a soft line". Each part's reason may be sound. Moving the line a priori is what the line was meant to stop, and it deserved a row in "Read this in the morning".

Projection against what is unbuilt [estimate, two data points; the review M10 method]:

| Part | Now | Projection | Unbuilt |
| --- | --- | --- | --- |
| Step, turn, world, seam, hooks | 1,086 | 1,900-2,400 | P2-P4, hierarchy, seam growth (M6) |
| Lane | 419 | 650-850 | `cancel`, `allow`, `HeldThisTurn`, fragment rows |
| Reads, timers | 114 | 600-900 | cache, resources, keyed schedules |
| Write-ahead | 242 | 500-700 | codecs, per-record restore, rebind, tombstones |
| Publication, Inspection | 78 | 500-700 | Inspection, `check()` |
| Driver | 247 | 600-1,000 | scopes, sessions |
| Entities | 314 | 1,000-1,600 | answers, positions, rebase, contested |
| Incarnations, parking, adoption | 0 | 1,300-1,700 | all |
| Streams | 0 | 1,100-1,500 | all |
| Context, resources | 0 | 700-1,000 | all |
| **Total** | **2,500** | **8,850-12,350** | midpoint about 10,600 |

So 10,000 is more likely hit than not, and likely by round 4 or 5; 12,450 is probably not. Round 2's 2,500 under budget is mostly unbuilt scope, as RESULTS says. Fixes here add perhaps 100-200 lines. Hold round 3's line for 9.6's cut, as D24 says, and take the owner's view on which stop stands.

### M12. Citations and tests sampled against their rules

| Test | Judgement |
| --- | --- |
| PAY-12/shuffle, DRV-01 | **H1 fixed.** Plans survive, injections with live fibers and real choices asserted. Coarse (`> 0` over 2,160 runs) and real. Oracle is ends plus abandoned equals sends: can fail |
| PAY-16, PAY-18, STORE-05, STORE-11 | Hold. Killed my matching mutants |
| LIKE-01 to 05 | Hold for D3. Each states an order and checks the server |
| ORDER-02 cites D1, L4 | Weak: "a person's order" asserts only the last element. Determinism check is real. D1's nesting untested |
| STORE-06's E18 line | Label claims more than it asserts |
| STORE-09 cites rule 30, D3 | Rule 38 and the mark hold; D3 is not exercised there |
| CART-01, REFUND-01 | Hold; real flows from the converted tests |
| LIB-01, 02 | Hold for what they name; LIB-03 says of itself "not a test of much" |
| DRV-03, PAY-17 | H2, H3: pin or under-test |
| LIKE-06 | Honest, see "design moves"; catalog row not updated (L3) |

---

## Low

- **L1. S4's first hang.** Cause not established, and the stated suspect is cleared. **[ran]** With `Say`, which grows memory, all four cells finish in 7 s with the same shape of numbers. **[read]** The script's `chrome up?`, `loading`, `loaded` prints and 150 s limit look added afterwards, which points at the harness, and I cannot confirm that: only the final script is in git. I found no runtime path: a sync `input` loop always drains, a yield re-enters by `host.later`, and no input is dropped outside fatal or a storm. The one loop that could spin forever is S4's own `while (lanes)`. Not a runtime bug on evidence, not ruled out. Add a watchdog print of `lanes`, `inbox`, `live` to S4 so a next time says why.
- **L2.** `driver.ts:219-224`: past the notify bound any input kind is dropped, while D35 says "the send". Reaching it with a `sent` would need a completion during notify; I found none. Filter by kind anyway, since a lost completion is the class D6 exists to stop. [read]
- **L3.** `SCENARIOS.md:213,221` still say "record `uncertain` stays, contested repair" and "queue released at 30 s". "Catalog disagreements: none" compares `cites` only. M7 of round 1 again.
- **L4.** `expected-changes.log`: 31 lines of `hash:... | see the lines above`. Per-hash exemption as D33 asked, with the reason now one bulk paragraph away.
- **L5.** `entities.ts:310`: the `StorageRefused` branch is dead, because `refuseResend` calls no `settled`. The comment reads as if it did.
- **L6.** `turn.ts:306`: a refused turn restores `kept.w`, so a module disabled during that turn comes back enabled with its issue still raised. [read]
- **L7.** Fixture drift: `issues.compiled.ts:47` `RenameUnsure` only toasts; design line 2910 cancels. Stated flattening does not mention it.
- **L8.** `fake-world.ts:155`: an awaited write does not wait behind a hung one for its key, despite the comment at 180. `pay.search.ts:14` `storage()` is true for an unawaited write blocked by a hung key, so `ack` can no-op; my first drain span on this. Pay's `reject` lane appears not to reach it. [read]
- **L9.** `stateHash` drops `savedLanes` and `boot`, and history-reading edge oracles (S6, S13) are not in it, so two scripts with one hash can differ in what those oracles would say. Small, and "equal means the same future" is stronger than it is. [read]

---

## The builder's design moves, on merit

| Move | View |
| --- | --- |
| D25 capability object | **Keep.** It stopped the round-1 class. Own slice, no lanes held. Too narrow for streams (M6), and `cx.user` has no meaning outside a turn (H6) |
| D26 write-ahead is core | **Keep.** Agrees with what the rows are |
| D27 | **Rework.** The separate-attempt half is right and well tested: a hook throw no longer loses `sent`, `timer`, `acked` or `turn`. Disable fails open (H3), fatal is not recoverable (H2) |
| D28 `Phase` | **Keep.** Best move of the round; freeze and search agree. `sends` is the one leftover flag (H1) |
| D29 | Keep and finish (M9) |
| D30 | **Keep the direction**, and finish it (M4, M1) |
| D31 | Revisit for unknown endings (M5) |
| D32 BFS | **Keep.** Reproduced to the state. Depth 8's numbers are exact |
| D33 | Keep; rename "proven" (H5) |
| D34, D35, D37, D39, D43 | Keep. D35's false alarm is gone; D39 has no cycle in my search |
| D38 | Budgets fine; the moved stop needs the owner (M11) |
| D40 | Follows from D3; M2 |
| D41 | **Do not cut as written** (H4). Contested as a position rule on writes may go; "a response that differs from what we hold" may not |
| D42 | Keep, and build or drop `read` (M6) |
| D44 | Fine as a stated shortcut |
| 14 hooks | Not a count problem yet; the missing capabilities are (M6) |

**Rule 32's third clause: agreed unreachable here, and the reason matters.** I tried to break it. **[ran]** The "success clears unresolved marks" mutant, with H1 fixed on a copy, persistence, reload, cancel, repair failures, and an added oracle "a Held Attempt's records stay uncertain": depth 7 complete, 134,212 states, the same state count as unmutated, no failure. **[read]** Each route: a later success needs its entry at the head of every queue, and an unresolved Attempt holds its entry until released or resolved. Restored entries re-join in mint order. So it follows from D3 alone. Flip D3 and it is live again, as the design's rule 30 had it. It costs one word (`m.given`), it documents the rule, and M2's D15 and D21 are near it. **Keep it**, as stated and untested, and do not treat it as a finding against the plan.

**LIKE-06.** The builder is right that the catalog contradicts rule 32, and right that the outcome is silent. **[ran through the suite]** It is what OD20 F1 accepted, though the design's words suggest a visible mark. A released write landing late is unfixable in the client without a version. The cheap narrowing: when a later success clears a `given` mark, force one repair, so the common late landing is caught soon. That's a proposal, it does not close the limit, and marks across a reload are still lost (stated).

## Round 1's findings, checked

| Finding | State |
| --- | --- |
| H1 shuffle vacuous | **Fixed** [ran] |
| H2 mutants | Improved: 2/16 to 20/31. `ends == sends` is real. Not done (H5) |
| H3 refused re-send sticks | **Fixed for `sends > 0`**, killed by my mutant; family survives through H1 |
| H4 Pay | Pinned, with fixes proposed (M10) |
| H5 D10 | `sent`, `timer`, `acked`, `turn` fixed. New failure modes: H2, H3, H6 |
| H6 seam | Fixed for lanes and persistence; new limits (M6) |
| M1 L3 | Partly (M9) |
| M2 search | **Fixed**, reproduced. Crossing missing (H5) |
| M3 D14 | Bound's path fixed; ack window remains (M1), and H1 reaches the same sentence |
| M4, M5 | Pinned. F7 reclassified properly |
| M6, M7 | Mostly fixed (M12, L3, L4) |
| M8 phases | **Fixed**, one leftover: H1 |
| M9 D13 | **Fixed**, one nit: L2 |
| M10 budget | Reset, by moving the stop (M11) |
| M11 harness | Fixed; 11% old-case edits honestly reported |

## Is the core pure?

**Yes, on what ran.** World and inputs frozen after every step: 120/120. No `Date`, `Math.random` or `performance` in core files (grep on 11). `replay` is exact and still compares no evidence or issues. Purity is not where the bugs are.

## What round 3 must decide, in order

All proposed. 1-5 first: each is cheaper before fragments.

1. **H1:** the one-line column fix and the oracle. Not really a decision; apply first.
2. **H2:** per-record restore, encoding inside the turn, what fatal means for a poison record.
3. **H3, H6:** fail closed for a disabled module; one rule for a user closure's throw outside a turn.
4. **H4, D41:** a differing response forces a repair; what remains of contested.
5. **M1, M4:** does a never-sent cancel wait for its ack; how a machine learns storage is silent.
6. **D3's price, M2:** visible cross-actor stalls, and whether D15 ships with round 3. Owner sees D3, D40, D41 and rule 32 as one decision.
7. **M3:** answer positions in the store, before streams.
8. **M5:** a lost unknown turn: redeliver once, or accept.
9. **M6:** streams on paper against the seam, before changing it, with cuts.
10. **M10:** Pay's memory, owner's. Then per-key oracles and narrow pins.
11. **M11:** which stop stands.
12. **H5:** the crossed search and the 11 missing scenarios join the suite before any round 3 green counts.

## Not checked

- S4 at the builder's plain-turn event not rerun; `s4.txt` read. No phone, Safari, Node, real `fetch` or IndexedDB.
- SEARCH-LIKE depth 9 and SEARCH-PAY depth 9 not rerun; the builder's mutant lists not rerun, and only their names compared afterwards.
- `tsc`, `vp lint`, `nub run verify`: not run.
- H1's money case is by editing the fake's stored record to model a lost capture, since the fake lands unawaited writes at once. M1 uses `landNoAck`. H4 and M10 lean on the fake's replay and charge behaviour: a real server may differ.
- My 32 mutants are one reader's choice from rules. S1, S2, S5 not re-read beyond what cites them; `pay.scenario.ts` read for PAY-12, PAY-17 and by mutant results only; desk code not read, and neither Checkout's stories beyond what fixtures cite.
- M6 and the size table are reasoning, not runs. Streams may need less if S5's fiber form is chosen.
