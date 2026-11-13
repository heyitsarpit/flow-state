# T7 fixes review (2026-11-11)

**Verdict:** the fixes hold, with no High. Every earlier finding the range claims is fixed, and each new mutant is
caught for its reason. The R4 revision is sound against its source and R14. The suite is still not airtight for
T16's Pay path. A `Released` is anchored to the actor, not to the lane. A guarded cancel is checked only one way.
The `Minted.key` rule is written down but nothing enforces it. I15's refusal exception is judged by counting
issues. The phase-model root cause (RC2) has now come up in three reviews in a row, which reaches the Epic's
convergence threshold.

An Opus lead with four Haiku sidecars reviewed checkpoints `a8714be6..1ab7e889` (`bcc2bbbb`, `578666d0`,
`b2b51634`, `1a61c26f`, `e1854588`, `1ab7e889`). The code was read from a `git archive 1ab7e889` copy in the lead's
scratchpad, with `a8714be6` as the base and the repository's `node_modules` linked in. The tree was not touched.
HEAD moved during the review (`edcf62be`..`6279cdf1`). Where HEAD already fixes a finding, the finding says so.
Those later commits were not reviewed.

**Runs by the lead** (from `packages/flow-state-v3` of the `1ab7e889` copy):

| Run                                            | Result                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `suite --parallel 4`                           | 69/69                                                                                              |
| `suite --runtime null`                         | 0/69                                                                                               |
| `falsify --parallel 4`                         | 47/47, each by its expected (oracle, Invariant)                                                    |
| `falsify --sweep --mutant lie.boot-drops-held` | red in 31 cases; `PAY-12/cancel-on-wire` and `PAY-15/cancel-on-wire` by its oracle (T6 M4's claim) |
| `nub run check` (root of the copy)             | zero errors, zero warnings                                                                         |

Paths below are under `packages/flow-state-v3/conformance/`, and lines are at `1ab7e889`.

## Root-cause classes

- **RC1, unanchored runtime claims:** a runtime report, or a count of reports, is taken as proof of which head or
  ending it concerns.
- **RC2, phase not one closed variant with one transition:** a phase is rebuilt from a missing value, or one
  lifecycle is spread over several collections or flags.
- **RC3, lane identity:** a lane is named from data that a fact does not carry (a turn's key, a mint's key).
- **RC4, record and doc drift.**

## Earlier findings

| Finding                         | State at `1ab7e889`                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T6 M1 (parked ending's channel) | Fixed: the channel is compared (`actors/disposal.ts:111-133`). No mutant was registered; see L3                                                                                                        |
| T6 M2 (disposal state machines) | Fixed: `Call` (`Open`, `Settled`, `Done`) and the kept lanes each step once and stay immutable. `callOf` still defaults to `Open` (M5)                                                                 |
| T6 M3 (ledger table)            | Fixed: `TABLE` is total over (phase, move) (`actors/disposal-ledger.ts:44-97`), `Settled` is split by cause, and only insertion bypasses it                                                            |
| T6 M4 (cancel on the wire)      | Fixed: `OnWire.cancel` stays `OnWire`. Confirmed by the sweep above. One residual remains (L1)                                                                                                         |
| T6 M6 (`Never`)                 | Fixed: `endingOf` (`dsl/domain.ts:55-80`) is the one rule. `mutant.short-disposal-bound` is caught as Actors I35                                                                                       |
| S2 H1 (quiet `Released`)        | Fixed for one intent: `lie.release-on-guarded-read` is caught as WriteLanes I12 on `PAY-15/retry-budget`. Residuals: M1, M2                                                                            |
| S2 M1 (keyed lanes)             | Decided (the Port requires `Minted.key`) but not enforced (M3)                                                                                                                                         |
| S2 M2 (reload drops `Held`)     | Partly fixed: `Held { at }` survives, and `mutant.boot-resends-held` is caught as I12. The one `(phase, fact)` table was not built (M5). A send in no lane is caught only when the lane was named (M3) |
| S2 M3 (no S2 log)               | Fixed (the STATUS T7 section)                                                                                                                                                                          |
| S2 M4 (I15's refusal exception) | Built: `1b.r8-refused-ending-not-redelivered` is caught as I15 on `DLV-04`. It is judged by counting (M4)                                                                                              |

## High

None.

## Medium

**M1. A guarded cancel of one lane anchors the `Released` of any lane of the same actor (RC3).**

- **Where:** `write-lanes/lane-queue.ts:196-204`. A `Released` passes when the step has a `Turn` of its owner whose
  (event, from, to) is in `mayCancel`. Neither the key nor the head is compared.
- **Rule:** WriteLanes I12 ("A Held lane leaves Held only by a retry's resolution, a cancel or cancelAll, or a
  release on leave") and R8 ("no quiet release").
- **Scenario (read, not run):**
  1. Shopper `a` pays `pi1`, which is lost, so `pay(pi1)` is Held.
  2. `Leave` is not authorized and goes to `LEFT`; `pi1` stays Held.
  3. `Start(pi2)` in `LEFT` (`prototypes/conformance/typed/pay.ts:438`), then pays `pi2`, which is also lost
     (`UNSURE`).
  4. `IntentRead` alt 0 cancels `pay(pi2)` only (`O.pay.cancel(intent)`, `typed/pay.ts:404-409`).

  A runtime that also releases `pay(pi1)` in that step passes `lane-queue`. The ledger then settles `pi1` as
  `Claimed` (`disposal-ledger.ts:90`), so I29 no longer requires it either. No case has two intents with one
  Held, which is why `lie.release-on-guarded-read` misses this.
- **Fix:** anchor a `Released` to the lane that the turn's cancel names. The `Turn` must carry the members it ran,
  with their operation and key, or the reference must say which event field gives the key. Add a two-intent case
  and register the scenario as a lie.

**M2. A guarded cancel is checked only one way, and the transition anchor cannot express `void` (RC1).**

- **Where:**
  - `write-lanes/lane-queue.ts:140-143`: `cancelOne` reads only `cancels`. `atTurn` (`:271-285`) queues only turns
    the suite drove. A turn that took a `mayCancel` transition is therefore never checked to release its head.
  - `fixtures/pay.ts:91-98`: `void.mayCancel` is `[]`, but `VoidUnsure` alt 1 runs `O.void.cancel`
    (`typed/pay.ts:331-337`). Both of its alternatives stay in the same state, so no (event, from, to) can tell the
    cancel from the retry. The Gotcha at `lane-queue.ts:431-433` states this limit.
- **Rule:** WriteLanes R14 ("Held: released (evidence) and promoted") and I12.
- **Scenario:**
  - A runtime that keeps the Held `pay` head after `IntentRead` `UNSURE`→`PLACING` passes every oracle. Only
    `PAY-03`'s own expectations fail (`write-lanes/payment-endings.scenarios.ts:86-88`), so falsify would show
    WrongReason.
  - `void` answered Lost four times: a correct runtime's `Released` is read as I12. This is latent, since no case
    answers `void` Lost.
- **Fix:** the `Turn` reports the alternative it took (or its members), and the reference names a may-cancel as
  (event, alternative). Such a turn is then judged as a cancel, the way `cancels` turns are. This also removes the
  stated limit.

**M3. The `Minted.key` rule is written down but not enforced, so M2's "a send in no lane" check is blind for Pay
(RC3).**

- **Where:**
  - `write-lanes/lane-model.ts:263-279`: I1 fires only when `laneOfId(model, id)` was named before the send.
  - `lane-model.ts:213-242`: `placedBySend` names the lane at the send and defaults the phase to `Waiting`.
  - `lane-queue.ts:259-268`: a reload drops `Waiting`.
  - At HEAD, `port.ts:136-138` states the rule, but no oracle rejects a keyed `Minted` that has no key.
- **Rule:** WriteLanes I1 ("No commit is invoked except one admitted …") and R1 ("restore … never replay a
  commit"). Also the orchestrator's decision of 2026-11-10 (`log.task`): the Port requires `Minted.key`.
- **Scenario:** every Pay write is keyed (`ByIntent`, `cartId`). A `pay` is minted and the page reloads before its
  ack. A boot that invokes it then passes `lane-queue`: its lane is named only at that send, and its phase is
  `Waiting`. No mutant replays a restored, never-sent commit. T16's production adapter could also leave `key` out
  and fall back to the weaker naming without anything failing.
- **Fix:** make a keyed `Minted` with no key a violation when the adapter declares that it reports keys. This is
  strict for the production adapter, with round-14 as the stated exception, in the same way as `Ended.failure`.
  Add a mutant that replays a never-sent keyed head at the boot.

**M4. I15's refusal exception is judged by counting issues, not by matching them to an ending (RC1).**

- **Where:**
  - `write-lanes/delivered-once.ts:318-341`: an `InvalidTurn` with nothing pending is counted as a second refusal.
  - `ending-lives.ts:112-122`: that count turns refused endings into kept ones, oldest first.
  - `delivered-once.ts:271-277`: a `Delivered` with nothing owed takes a kept ending in any step.
  - `port.ts:168`: `Issue` carries only a `code`.
- **Rule:** WriteLanes I15 ("delivered once more after queued mail, and a second refusal is final") and Actors R15
  ("A kept ending gets one try per boot or …").
- **Leniencies (read, not run):**
  1. Any other `InvalidTurn` in the step excuses a missing redelivery.
  2. A third try passes.
  3. A kept ending can be retried in a later step with no reload and no adopting ensure.
  4. Two pending deliveries make a refusal unattributable (`:330-332`), which gives a false fail.

  After the range, the builder logged 1, 2 and 4 as stated limits (`c8b918db`). Leniency 3 is not among them.
- **Fix:** the Port's `Issue` names the event and Attempt it refused. T16's adapter meets that, and round-14's
  gap is a stated limit. Admit a kept ending's `Delivered` only after a `Reloaded`, or after an `Ensured` that
  adopts it.

**M5. RC2 has reached the convergence threshold: the oracles' phase models (RC2, RC3).**

- **Evidence that the root cause recurs:** T6 review M2 and M3, S2 review M2 and M5, and now the following:
  - `write-lanes/lane-model.ts:228-231, 264-272, 345-357` invent `Waiting`, `Wire` and `Held` when no entry
    exists. Phase changes are spread over `mint`, `joined`, `placedBySend`, `sent`, `end`, `without` and
    `reloadedLive`. S2 M2's "one `(phase, fact)` table" was not built.
  - In `delivered-once`, one refusal lives in `Walk.pending`, `Life.Refused` and the `secondRefusals` counter
    (`delivered-once.ts:52-57, 318-341, 406-409`).
  - `Owed { inDisposal, lastTry }` is two flags, and `refusedOnce` has a catch-all that turns any non-`Owed` life
    into `Kept` (`ending-lives.ts:15-20, 97-100`).
  - `actors/disposal.ts:64`: `callOf` returns `Open` for an absent call.
  - Four separate per-Attempt phase models: `lane-model`'s `Phase`, the ledger's `Phase`, `Written`'s flags
    (`written-attempts.ts:18-27`) and `ending-lives`' `Life`.
- **Rule:** AGENTS.md ("Don't write any implicit state machines"; "Store facts, derive views"), STYLE.md (one closed
  variant, one transition, never rebuild a phase from absence), and the Epic's R35 threshold (3).
- **Bar:** only `disposal-ledger.ts`'s `TABLE` meets it.
- **Fix:** one convergence pass. Build one Attempt lifecycle, a closed variant plus a total `(phase, fact)` table,
  in `dsl/domain.ts`. Each oracle projects its view from that lifecycle. Fold in M1 to M4, which are all about
  what a fact names.

## Low

- **L1 (RC1, the residual of T6 M4):** after a cancel on the wire, a server answer still moves the head
  (`OnWire.success`/`failure` → `Answered`, `disposal-ledger.ts:57-64`). R14 keeps the interrupted call Held,
  whatever the server did. A runtime that drops it at disposal then passes I29. This is latent: no disposal case
  answers after a cancel on the wire.
- **L2 (RC2):** suppose an unknown answer comes at request time in the step that mints. `Requested` is noted after
  the step's reports (`dsl/case.ts:159-187`). So the ledger moves `Minted` → `EndedUnsent` and never reopens it
  (`disposal-ledger.ts:51`, `stays`). The Attempt was sent and ended unknown, yet I29 never requires it. Latent.
- **L3 (RC1):** I29 compares the channel only (`actors/disposal.ts:111-133`), so a parked `CardDeclined` that is
  delivered as `Busy` passes `disposal`. `ending-channels` catches it as I3, because `mapped.latest` survives the
  reload (`ending-channels.ts:39-47`). No mutant covers T6 M1. `deliveredAs`'s `onNone: () => true` is a dead,
  lenient branch (`:112-113`).
- **L4 (Spec):** the R4 revision matches `HeldThisTurn` (machine-design at `20986677^`, lines 2336 and 2765-2786)
  and R14. Two points for the user's read:
  - its new last sentence retains `O.x.cancel`'s `unknown { Cancelled }` under every policy, while the old table
    held it only for its own turn under the `cancel` policy (row "unknown, interrupt");
  - R8 ("no quiet release") and I12 have no carve-out for the `cancel` policy's per-turn hold. I5 covers it, and
    `lane-queue` reads such a `Released` as I12 (a stated Gotcha).
- **L5 (RC4), drift:**
  - `STATUS.md` at `1ab7e889` has no M4 entry, and its bottom line still says 68/68 and "M4 … not started". Fixed
    at `c8b918db`.
  - The ledger's `learn` doc (`disposal-ledger.ts:281-282`) and STATUS say a driven cancel settles a "waiting"
    head. `cancelled()` walks only sent heads (`:211-226`), so a never-sent head settles through its `NotSent`
    ending instead.
  - Rule ids appear in doc comments: `delivered-once.ts:443, 447, 456, 464`, `lane-queue.ts:397-438` and
    `runtime-disposal.scenarios.ts:24-25`.
  - The `lane-queue.mutants.ts:9-20` header names 13 of 18 mutants, and README:206-208 contradicts :265. Both are
    fixed at HEAD.
  - `dsl/case.ts:409` says the clock goes "past the disposal bound"; it reaches it exactly.
- **L6 (RC2, STYLE), sentinels and duplicates:**
  - `indexOf(fact) + 1`, twice (`actors/disposal.ts:323`, `disposal-kept.ts:89`);
  - a missing key field reads as `null`, the same as an explicit `null` (`dsl/domain.ts:30-35`);
  - the "owner from the owed ending" lookup is written twice with different predicates (`delivered-once.ts:166-173`
    and `:245-256`);
  - a default `"reject"` policy when `Known` is missing (`lane-model.ts:164-167`);
  - declines listed by hand (`lane-model.ts:323`) beside `FLOW_DECLINES`;
  - `cancels` read three ways;
  - refused endings are appended at the end (`delivered-once.ts:339`), so "oldest first" means oldest refusal.
- **L7 (types):**
  - `Transition` is not typed by the fixture's events or states (`fixtures/reference.ts:39`), so a typo in
    `pay.ts:74-77` compiles;
  - `Issue.code` and `Ended.reason` are plain strings (S2 L7, carried);
  - `Attempt` (`disposal-ledger.ts:110`), `mayHaveApplied` (`dsl/domain.ts:107`) and `Replacement`
    (`written-attempts.ts:11`) are exported but used only in their own module.
- **L8 (RC4):** `mutant.disposal-skips-never-sent` expects Actors I29. The clause it breaks is R22's "a never-sent
  … ends NotSent { Disposed }", which no Invariant states (`disposal.mutants.ts:49`, `disposal.ts:151-156`).
- **L9:** no check covers an unknown ending of an Attempt that was never sent: `end` holds it
  (`lane-model.ts:345-357`), and `delivered-once` never reads `sent`. No mutant.

## The builder's log

The log is accurate on what it claims. I re-ran every caught-by claim I could check, and all of them hold. Its
sidecar logs record accepted, noted and rejected items with reasons.

- **Gap:** `1ab7e889` landed M4 with no log, and the log came one commit later (`c8b918db`). This is the S2
  review's M3 again, only shorter.
- **Over-statement:** the M2 entry says "a send of an Attempt that left its lane is WriteLanes I1". That holds only
  for a lane that was named (M3).
- **Over-statement:** the M4 entry (T6) says a cancel settles a "waiting" head (L5).
- **Workflow records:** `Pending.plan` D1 agrees with the spec-log's R4 entry. `workflow check` on the copy reports
  only the archive's missing `codebases/`.

## Sidecar log

Each finding was checked by the lead against the code at `1ab7e889`.

**(a) Code quality (15 findings):**

- **Accepted:**
  - 2, 3 and 4 → M5;
  - 5 → M5;
  - 6, 9 and 10 → L6;
  - 11 and 12 → L6;
  - 15 → L6, reworded: the effect is on order, not on pairing.
- **Accepted, fixed after the range:**
  - 1 (`ending-channels` mutation; S2 M5) → `4ad1daa8` and `a5df7376`;
  - 8 (the `-1` sentinels) → `edcf62be`.
- **Carried from S2 L3:** 7 (template keys).
- **Changed:** 13 → Low. `Known.lane` is a fact learned at the send, and only `policy` is derivable.
- **Rejected:** 14. The runtime's state is a two-value phase with one transition (`DisposingRuntime`, `Reloaded`).

**(b) Types, comments and lint (15 findings):**

- **Accepted:**
  - 1, 2 and 3 → L5;
  - 8 → L5;
  - 10 and 11 → L7;
  - 12 → L7;
  - 14 → L5.
- **Accepted, fixed at HEAD:** 6 and 13.
- **Carried from S2 L4:** 4 (the doc on the private `State`).
- **Rejected:**
  - 5: lint passes, so the rule is not enabled;
  - 7: the doc describes the case's context, and DLV-03 runs under `reject`;
  - 9: the `RETURN_TYPE` wording is a nit;
  - 15: the missing "When to use" is suite-wide, not this range's.

**(c) Disposal and the ledger against Actors (12 findings):**

- **Accepted:**
  - F1 → L3, downgraded: `ending-channels` catches the wrong event;
  - F2 → L2;
  - F3 → L1;
  - F6 → L8;
  - F9 → L3;
  - F11 (the "waiting" part) → L5.
- **Rejected:**
  - F4 and F8: stated limits (`disposal.ts:440-442`, `:404-405`);
  - F5: anchoring is `lane-queue`'s, under I12, apart from M1's gap;
  - F7: a gap in the Port contract that no Invariant states;
  - F10: no evidence, and round-14 passes;
  - F12: a fixture limit already known.
- **Its answers to Q1, Q2, Q3 and Q5 were checked, and they hold.**

**(d) `lane-queue`, `delivered-once` and their mutants against WriteLanes (13 findings):**

- **Accepted:**
  - F1 → M1;
  - F2 → M2;
  - F3 → M2, reworded: no transition can express `void`'s cancel;
  - F4 → M3;
  - F5 → M4;
  - F6 → M4;
  - F11 → L9.
- **Rejected:**
  - F7: I11 is the break the oracle can observe;
  - F8: fixed at `edcf62be`;
  - F9: falsify shows it caught by I20 on `LANE-04`;
  - F10: a stated Gotcha;
  - F12: R4's exhaustive mapping makes it moot;
  - F13: falsify shows the redelivery in its step.

## What to fix first

1. M5: run the convergence pass on the Attempt lifecycle, and design M1 to M4 into it. They share the question of
   what a fact names.
2. M3: enforce `Minted.key` for adapters that report keys before T16's adapter lands. Add the boot-replay mutant.
3. M2 and M1: the `Turn` reports its alternative or its members. Then judge guarded cancels both ways and anchor
   them per lane. Add the two-intent case and the `void` Lost case.
4. M4: the Port's `Issue` names what it refused, and a kept ending's retry is gated on a boot or an adoption.
5. The Lows, as T7 touches each file. L4 goes to the user's read.
