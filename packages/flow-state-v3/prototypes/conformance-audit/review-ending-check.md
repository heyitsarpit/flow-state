# Review of oracle (j), redesigned once (stage K)

Commit `3d6f2f2d`, branch `flow-rewrite`. One adversarial review under `policy-convergence` (step 7), before the single holistic revision (step 8). Run from a detached worktree at `scratchpad/review-k`, removed by exact path at the end. The lie runner is `/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/review-k-scripts/run-mut.ts`. It copies `round-10` to `mut-<id>`, applies the edits, and runs `main.ts --no-output`; every lie below is defined there by id. Each command was bounded by `watch.ts --seconds 295`, one at a time, with a peak of 1463 MB. No subagents, no commits, and no repo writes besides this file. One scenario variant was added in the worktree only (H4) and reverted before the gate reruns.

Marks: [ran] reproduced at `3d6f2f2d`; [read] seen in the code; [reasoning] inferred, not run.

"0 by (j)" means no FAIL line carries `(j)`. "Named" counts all FAIL lines with `--no-output`, most of them hand-written `c.eq`/`c.state` asserts.

## Verdict: FAIL, by a new class

The redesign closes what it set out to close. `h.restore-at-send` is red 17 of 17 by `(j) restored in` and `h.boot-order` 1 of 1, both [ran]. The gates the builder left are green (section 5). But the review finds a class that is not one step further along a listed dimension. It is the root cause the design names R1 (a runtime's report pays, or sets the expectation), surviving in two forms the design did not list:

- **R6. The runtime's silence is an excuse.** No published actor or copy means "owner not alive". No `ending` evidence means nothing is owed. No `leaves` answer means nothing to anchor. No `boot` evidence means still loading. An `Unhandled` pays a delivery that ran nowhere.
- **R7. The cause names a recipient but not what it owes.** The rule matches "the same event" and "a node in the anchored chain". The code takes any event the op maps and any node of the chain. Rule 14's start node (current or late) and the ending's own event are never derived, so they are never checked.

Seven Highs follow from these. Most are cheap to close, because the suite already holds the facts (the disk's heads, its own ensures and disposes, the compiled outcomes and parents). Two are stated limits whose reasons do not hold (L1, L5). One is the stage's own new lie, `h.boot-order`, which passes when the endings belong to copies.

## Findings, ranked

| # | Sev | Finding | Lie and result (`--no-output`) | Revision or limit |
|---|---|---|---|---|
| H1 | High | **D9's anchor is opt-in by the runtime's codec.** `leaves` may answer `undefined` ("no live record"), and `anchor()` then skips the actor. Nothing gates `recipients.anchored`. L1 says this needs two coordinated lies; it needs one legal answer | `k.no-leaves+at-send` (`leaves` answers `undefined`, plus S1′): **739/741, 0 by (j)**, anchored 1071 → 0. Red only in PAY-08 (a timer count) and R10-BOOT-STATE (memory). This is 10j's S1′ result again [ran] | Revision. A record whose key the codec calls `actor`, whose actor the runtime publishes after the boot, must have a root leaf in `leaves`. Every copy the runtime publishes for it must have one too. Otherwise red. Lock the anchored count in the control |
| H2 | High | **What a boot owes comes from the runtime's own `ending` evidence, not the disk.** `owedAtBoot` reads `disk.parked` only. A held head's `unknown { Restored }` (rule 44, "exactly once") is owed only if the runtime says `ending`. `disk.heads` is used only by `writeAheadLies` | `k.held-silent` (restore neither notes nor mails a held head's Restored; the hold stays held): **740/741, 0 by (j)**, observed −20. Red only in PAY-15/reload-holds-exactly-once (`delivered once`) [ran] | Revision. At a reload, every head on disk (`disk.heads`) on a lane that is not releasing is owed one ending at the boot, as `bootOwed` already owes parked ones. This is the entity case: rows that reload holding writes |
| H3 | High | **"Owner not alive" is read from what the runtime publishes.** `over = … \|\| leafOf(owner) === undefined` (D185), `lifeOver` → `publishedNow(actor) === undefined`, `bindsCopy` → `leaf === undefined ? "no"`, `Reference.copies` → `if (!got) continue`. A row or copy the runtime silently fails to restore, or drops while live, excuses its own endings. Section 1's D4 says "suite's own record". The code does not do that | `k.drop-row` (each actor with a restored ending is not restored): **0 by (j)**, named 48 (hand state asserts), anchored → 451. `k.drop-copy` (the copy is dropped, its membership kept): **0 by (j)**, named 4, anchored → 848. `k.vanish-live` (an actor silently vanishes when a failure lands): 15 of 64 by (j) [ran] | Revision. An actor is alive by the suite's own steps: ensured, not disposed, record on disk at the reload. An actor or copy with a live leaf in `leaves` that the runtime does not publish after the boot is red, unless a `RecordQuarantined` names it. The same holds for an actor the suite never disposed that stops publishing |
| H4 | High | **D11 (D185) holds only for a definition's op.** `bound` requires `fragment === undefined`, so a dispose that waited on a slow load and stepped before the **copies'** restored endings is not red. L7's reason (a lost reset can unplace a copy) does not cover the whole actor being disposed | FRAG-24 with `load: "hang"` and `h.do({ dispose })` waiting (worktree-only variant): control 2/2, observed 4. **`h.boot-order` 2/2 green, observed 2**: the copies' Restored never ran and parked silently [ran] | Revision. The actor-gone check at a park (`leafOf(d.actor) === undefined`, live at the boot) applies to every op. Only the copy's own unplacement stays under L7. Add the variant as a named case: entity rows are copies |
| H5 | High | **D3 has no lie for a ghost life of the same key.** `want.life` is `lifeOf` (the current life), and `resolve` stamps the current life on any serial (10j's carried "stale serial" item, dropped from the limits). A runtime that runs a disposed actor's ending in its retired record resurrects it, and the run is matched as observed | `k.ghost-life` (`admitEnding` falls back to `own(tx.w.retired, …)`): red in 3 of the 10 cases where `probe.ghost-life` fires, **1 by (j)**. Fully green: FRAG-08/persisted-disposed-ending-parked-delivered-once, FRAG-15, REV5-H5H6 ×3, REV5-M1/a-crash-during-recovery…, REV5-M1/the-record-goes-once-delivered [ran] | Revision. A delivery of an attempt whose life is over (`attemptLife ≠ lifeOf`) with no suite `ensure` since the dispose is red. So is an actor that publishes again with no suite `ensure` since its dispose. Life joins the identity (D13) |
| H6 | High | **Missing dimension: where the ending starts in its recipient (rule 14).** The rule accepts "a node in the anchored chain". Rule 14 fixes the node: current from the active leaf, late from the nearest live ancestor of the owner, and every Restored current. Both lies are in the chain | `k.late-as-current` (every ending routed current): `probe.late` fires in 17 cases, the lie is red in 6, **0 by (j)**. Green includes **REV4-S2/r14-a-late-ending-starts-at-the-nearest-live-ancestor** and **…/r14-with-no-live-ancestor-it-starts-at-the-root**. `k.restored-from-root` (Restored routed late from the root): **0 by (j)**, named 5, unobserved 143 → 147 [ran] | Revision for "current". The first ear of a current or Restored run must sit at the deepest node, walking up from the published leaf, that has `on[ev]`. That comes from compiled parents, with no guards. "Late" is a stated limit unless the suite tracks the owner node's continuous presence in the published chain since the ask |
| H7 | High | **A2 (L5) is paid by the runtime's `Unhandled`.** `if (ob \|\| heard)` pays a delivery when any `turn`/`Denied`/`Unhandled` is in the batch. A delivery said and run nowhere is "unobserved", and `unobserved` is printed, not gated. L5's reason, a probe on every alternative, does not apply: every alternative of a mapped event already carries the ear. A realistic shape is an ending routed to the wrong actor or copy whose state does not handle it [reasoning] | `k.claim-unhandled` (each failure with an attempt is said `delivered` + `Unhandled`, never run): **0 by (j)**, named 32 (hand), observed −6,601, unobserved 143 → 443 [ran] | Revision. An unobserved delivery is red when the reference says the recipient's published chain has an alternative on the event with no token. Lock `unobserved` in the control |
| M1 | Medium | **The anchor is taken when the runtime chooses to say `boot`.** `anchor()` runs in `ledger` on the boot evidence. A runtime that sends that evidence after its restored turns is anchored on the post-turn state | `k.ev-late` (boot step's evidence held to the end of the pump): red in 23 by `(j) restored in` (loud: correct restores now look wrong). `k.ev-late+at-send`: S1′ goes green in PAY-15/reload-holds-exactly-once, PAY-16/retry-count-persists and REV8-M3/a-hold-does-not-rewrite-per-boot, and PAY-08/reload-while-reconciling is red only by its timer [ran] | Revision. Anchor each actor before the first ear in it after a reload (and at the boot evidence, whichever comes first) |
| M2 | Medium | **`quiet().loading` and every boot anchor key on the runtime's `boot` evidence.** A runtime that never says `boot` turns off D9, D11 and `checkMints` in every case (`bootSeen` is false from the start of each instance) | `k.no-boot-ev+at-send`: **0 by (j)**, anchored 0, red in 52 by other named oracles (`a send never ended`, `delivered with no ending`). `k.no-boot-ev+boot-order`: 0 by (j), 51 named [ran]. Loud, not a wrong pass | Revision. `loading` comes from the fake (a `load` the suite has not answered). A boot's anchors run at the suite's own reload or `loadOk` step. No `boot` evidence after the suite answered the load is red |
| M3 | Medium | **Missing dimension: what the ending is (its event).** `evs = mappedEvents(op)`, every event the op maps. "The same event" is not the event this ending maps to (rule 13). (j) cannot tell success from failure or unknown | `k.restored-as-success` (a restored unknown runs the success event): **0 by (j)**, named 33. `k.failure-as-success`: **0 by (j)**, named 59 [ran] | Revision. The owed event is the compiled mapping of the ending's channel. The channel comes from the fake's answer, or from the restore table (unknown { Restored } for a head, NotSent { Restored } for W). It is checked against the runtime's `ending` evidence |
| M4 | Medium | **L9 is the main case, not an edge.** Rule 47 says a view never sends a mapped event, so for any real app the ear-based order check (`a driven event ran before the restored endings`) never fires. Only harness sends of mapped events reach it. Section 2's "the published leaf moves only by runs the ledger has matched" is stated but not enforced | `k.send-ahead` (a waiting `send` steps before the restored mail; the `dispose` keeps its place): **0 by (j)**, red only in R10-BOOT-ORDER's memory assert (and REV7-M2) [ran] | Revision. While an incarnation has restored endings owed, its published leaf and memory may not change except by their own matched runs. This also closes the cheap half of L2 (a move with no cause the suite saw is red) |
| M5 | Medium | **Stream deliveries are outside (j).** Rule 47 counts them as endings, and rules 14 and 70 route them. `listen` puts ears only on `success`/`failure`/`unknown` events, not on `value`, `pages` or `missed`. Entities' `listen` (2.8.14) is the main fan-out path | `k.stream-other` (a session's delivery runs in another live actor with an incarnation at the same path): **0 by (j)**. `probe.stream-other` fires in one case only (REV6-H4/other-machines-keep-streaming), red there by a hand assert [ran] | Revision, or state it as L10 with that reason. Ears on stream outcome events, and the fake's pushes as their causes |
| M6 | Medium | **"Once" is per boot.** `told`/`bootOwed` are rebuilt at each kill from the runtime's codec on the runtime's bytes. A delivered parked ending left on disk is owed again at the next boot and paid again | `k.parked-every-boot-silent` (a delivered parked record is never deleted; `probe` variant: kept in 30 cases): **0 by (j)**, red in 4 by hand disk asserts (REV5-M1/the-record-goes-once-delivered, REV9-KEPT ×1, REV9-EDGE ×2) [ran] | Revision. Remember attempts whose ending a matched run took. A later boot that owes or delivers the same one is red (rule 17), except a held head's per-boot Restored (rule 44) |
| M7 | Medium | **L3 is vacuous.** No case sees reversed parked order, REV9-EDGE/two-parked-on-a-lane-at-boot-are-both-heard included. Rule 44 promises saved order, and a row toggled while unmounted is the entity shape | `k.parked-reversed`: **741/741** [ran] | Revision (cheap). Compare the ear order of an incarnation's restored runs with `disk.parked` order |
| M8 | Medium | **Counts that say a class broke are printed, not gated.** `anchored` 1071 → 0 / 451 / 848, `unobserved` 143 → 443, `observed` −6,601: nothing goes red | All the lies above [ran] | Revision. Put RECIPIENTS under the lock (an unlogged change is red) |
| M9 | Medium | **One torn, wiped or corrupted record turns (j) off for the whole case** (`ledgerOff`, `drive.ts:981`, `:1198`). Rule 46 and D46 restore per record, so the other rows of that reload are unchecked | [read] | Revision. Scope the excuse to `disk.scope` of the edited keys |
| L1 | Low | **D6 accepts a Superseded sent head.** It checks "policy `latest` and a newer attempt", not "never sent" (2.7.13 item 1) | `k.supersede-head`: **0 by (j)**, named 7 (hand counts) [ran] | Revision (cheap). A Superseded attempt the fake saw requested is red |
| L2 | Low | `leaves` skips `frozen`, so a frozen copy's restored leaf is never anchored, and a thaw is not an anchor | `probe.frozen-at-send`: frozen incarnations at a reload in 4 cases. `k.frozen-at-send` is a no-op there, so not shown [ran] | Limit, or anchor at the thaw |
| L3 | Low | Identity is (actor, life, path). Two incarnations at one path (a copy removed and re-added) are one recipient, which is wrong for reads (rule 52) and sessions (rule 70) | `probe.read-orphan` fires in no case [ran] | Limit |
| L4 | Low | The codec gets the suite's live `fake.kv` Map (anchor, `parked`, `heads`). A codec can write the suite's bytes | [read] | Revision: pass a copy |
| L5 | Low | L8 should be impossible: rule 47 forbids a schedule or a raise sending a mapped event, but the hand-compiled fixtures are not checked for it | [reasoning] | Revision: assert `scheduleEvents ∩ mappedEvents = ∅` at `start`, which makes L8 vacuous |
| L6 | Low | The D11 send check is per actor (`d.actor === o.who.actor`), not per incarnation as rule 54 is. A send to copy d2 while d1's ending is owed is called "before" | [read] | Revision, with M4 |
| L7 | Low | Wording. Section 1's D4 says "suite's own record" (H3). D9 says "not the runtime's decode", but `leaves` is the runtime's codec. A production Port that implements it with restore's own decode reduces D9 to a consistency check (L1 proper) | [read] | Revision: reword, and say in the Port contract that `leaves` must not share restore's decode |

## 1. Is the list of dimensions complete?

No. The 13 rows cover who, how many and when at a reload. Five dimensions are missing outright, and each has a lie that is 0 by (j):

| Missing dimension | Source | Lie |
|---|---|---|
| **What**: the event this ending maps to | rule 13, rule 44 (Restored vs NotSent { Restored }) | `k.restored-as-success`, `k.failure-as-success` (M3) |
| **Where in the recipient**: the start node, current or late | rule 14, rule 15 | `k.late-as-current`, `k.restored-from-root` (H6) |
| **Existence**: the recipient exists when the suite's own facts say it does, and silence is no excuse | rule 44, rule 46 | `k.drop-row`, `k.drop-copy`, `k.vanish-live` (H3) |
| **Owed from the disk**: what a boot owes is read from the bytes, holds included, not from the runtime's `ending` | rule 44, rule 46 | `k.held-silent` (H2) |
| **Streams**: deliveries are endings too | rule 14, rule 47, rule 70 | `k.stream-other` (M5) |

Two listed dimensions are narrower than written. D5 is per boot, not per Attempt (M6), and D11 holds for root ops only (H4). Entity-style fan-out is where these meet: many rows reloading together (H2, H3, M9), rows as copies (H4, `k.drop-copy`), rows unmounted and remounted (H5), and `listen` (M5).

Not a missing dimension: an ending's store effects (rules 27 and 30). Those belong to the records oracles, not to (j) [reasoning].

## 2. One new lie per dimension

| Dim | New lie | Red by (j)? |
|---|---|---|
| D1 actor | `k.stream-other` | No (0). Probe in 1 case |
| D2 copy | `k.read-to-new-inc` (a lookup's ending to a live copy when its own ended) | Vacuous: `probe.read-orphan` fires in no case. Live wrong copy where unhandled: see H7 [reasoning] |
| D3 life | `k.ghost-life` | 1 of 10 probe cases; 7 fully green |
| D4 once, not zero | `k.held-silent`; also `k.drop-row`, `k.vanish-live`, `k.claim-unhandled` | No (0, 0, 15 of 64, 0) |
| D5 once, not twice | `k.parked-every-boot-silent` | No (0) |
| D6 supersede | `k.supersede-head` | No (0) |
| D7 reload, who | `k.drop-copy` | No (0) |
| D8 reload, routing | `k.restored-from-root` | No (0) |
| D9 reload, restored state | `k.no-leaves+at-send`; `k.ev-late+at-send` | No (0); S1′ green in 3 of 17 |
| D10 restored memory | not built. (j) checks no memory by design; a swap of two copies' memories moves their serials with them [reasoning] | n/a |
| D11 order | FRAG-24 slow load + waiting dispose under `h.boot-order`; `k.send-ahead` | No; No |
| D12 suite's causes | not built. Sends credit (actor, event, path), and a run in another path is not paid [read]; L8 per L5 | holds as read |
| D13 identity | `k.ghost-life` (life not in the identity) | see D3 |

## 3. Stated limits L1-L9

| Limit | Verdict |
|---|---|
| L1 codec and restore agree on a wrong leaf | **Understated** (H1). One legal codec answer turns D9 off. The two-lie version is a true limit; reword it per L7 |
| L2 the published leaf between anchors | Partly a limit (a target needs guards). Its cheap half is a hole: a move with no matched run or suite cause is unchecked (M4). The start node is not L2's (H6) |
| L3 order among one incarnation's restored endings | **Vacuous** (M7). Its reason, "no case", is a case to write, and the check is cheap |
| L4 order across actors | True limit, not promised |
| L5 allowance A2 | **Not a limit as reasoned** (H7). Every alternative of a mapped event already has the ear, and the gap is the runtime's `Unhandled` paying |
| L6 a serial moved by a spread | True limit, Low |
| L7 a copy's binding at a boot | True for a lost reset. **It does not cover the actor's own dispose** (H4) |
| L8 timer and follow-up credits | Should be vacuous by rule 47; make it an assertion (L5 above) |
| L9 the order of an unmapped send | **The general case** for real apps, by rule 47 (M4) |

Dropped without a word: 10j's "a stale serial resolves to the current life" (its consequence is H5) and "`Host.decode` is optional" (production contract). Neither is in L1-L9.

## 4. Does the redesign keep the harness honest?

- **Runtime behaviour: unchanged** [ran, read]. `round-10/adapter.ts` gains only `disk.leaves`, a pure reader of the map it is given, called only by the suite. The control is 741/741 with RECIPIENTS identical to STATUS (observed 45,648, anchored 1,071). `mutate-one` on the control is `killedBy: null`. `anchor()` reads `inst.state` and `inst.inner` inside the runtime's `onEvidence`, through pure getters over the last logged world.
- **`DiskCodec.leaves`: trusted where it should be checked.** Its silence is an excuse (H1), its answer is taken at a time the runtime chooses (M1), it skips frozen copies (L2), and it receives the suite's live map (L4).
- **`quiet().loading`: the runtime's word.** It is `!bootSeen`, where `bootSeen` is set by the runtime's own `boot` evidence (M2). The suite knows whether its fake has answered the load; that is what `loading` should read.
- Also trusted, older than stage K but inside (j)'s rule: `due` lists only the restored endings the runtime said in the boot batch (H2), and "owner not alive" is read from what the runtime publishes (H3).

## 5. Gates the builder did not finish [ran]

| Gate | Result |
|---|---|
| `mutate-one.ts --runtime ../round-10/adapter.ts` (control) | `{"killedBy":null,"killers":[],"search":"not run"}`, 181.6 s, peak 1463 MB |
| `mutate-one.ts` on one mutant (`g125.laundered-as-evidence` from `mutants-r10.ts`, as `mut-g125.laundered`) | `killedBy: "suite"` (MED-01/other-actor-behind-a-hung-ack, R10-BOOT-ROWS ×2, R10-BOOT-STATE, R10-BOOT-ORDER, R10-AUDIT-ENDINGS), 59 s |
| `falsify --part lies --slice 8/24` (`lie.serialize-as-latest`, `a6.abandoned-like2`, `h.boot-order`) | 3 of 3 `ok`, `FALSIFY every gate fails on what it should`, 183 s. `h.boot-order` red 1 of 1 (R10-BOOT-ORDER); `a6.abandoned-like2` 3 of 3 |
| Builder's lie, rerun | `h.restore-at-send`: 724/741, 17 of 17 by `(j) restored in` |

Scratch: 31 `flow-falsify-*` directories in `$TMPDIR` predate this run and were left alone. Mine removed their own.

## What the revision should take from this

One sentence per root cause, for the from-scratch pass:

- **R6.** Every excuse and every owed list is computed from the suite's own facts: the bytes through the codec (records, heads, parked), its own steps (ensure, dispose, reload, load answered), and the compiled data. The runtime's silence (no publish, no `ending`, no `boot`, no `leaves`, an `Unhandled`) never pays and never excuses, and every count that measures coverage is locked.
- **R7.** A cause names its recipient (actor, life, copy), its event (rule 13's mapping of its channel), its start (rule 14: the deepest handler up from the leaf for current and Restored), its order (rule 44's saved order, nothing in the incarnation moving before its restored endings), and its count across boots (rule 17). Streams are causes like any other.

Then a short list stays as stated limits with reasons that hold: L1 proper, late start beyond the owner-presence approximation, L4, L6, frozen copies and reads at one path.
