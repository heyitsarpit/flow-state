# Performance architecture audit (2026-11-17, proposed)

**Status (2026-11-20):** acted on: its fixes were built in P3: records captured on issue (@task.V3.T85,
@plan.Pending.D30), compiled walkers (@task.V3.T9, D27), fast test commands and forked reload sweeps (@task.V3.T83,
@task.V3.T90), no caps (@task.V3.T84). The text below is prior art.

**Bottom line:** the turn is cheap. `runTurn` takes 1 to 2 % of a run. The time goes to three generic mechanisms
around it:

1. **Every step re-encodes every touched record in full.** It takes four generic walks per record, and the edge
   then throws most of that text away by coalescing it. This costs 23 % of `transfers/long`, 28 % of
   `session/long` and 76 % of the palette stress run.
2. **The test tooling replays Stories from the start at every position.** It also drives 1,000 seeds where 1 to 8
   find the same cells. Four reload sweeps and four pair files take 81 % of the suite's file time.
3. **The step scans the whole world and copies whole maps for each change.** It keys everything by a string built
   per call. `actorKey` alone takes 13 % of `session/long`.

Each has a compiled or structural fix, ranked below. Nothing here is applied; every Task change below is proposed.

**Read first:** @plan.Pending.D27, @task.V3.T9, @task.V3.T83, @task.V3.T84,
`wiki/specs/core/WriteAhead.spec` (realization: projection at the step's end).

## Measurements

All runs used a `git archive` copy of HEAD a829ebe3 in a scratch directory, alone on the machine, on Node 24.21
with `--cpu-prof`. "incl." means the time spent in a function and everything it calls; "self" excludes callees.

| Run | Wall | Largest shares |
| --- | --- | --- |
| `transfers/long` x600 | 0.058 ms/turn | `project` 23 % incl., codec 16 % self, Effect ~20 % self |
| `session/long` x300, 14 actors | 0.179 ms/turn | `project` 28 %, `actorKey` 13 % self, boot decode 7.6 % |
| `reloads.test.ts` | 57 s | Story runs 64 %, run rules 18.6 %, `project` 15 %, boot 11 % |
| palette stress (`-t palette`) | 82 s | `project` 76 %, codec 64 % self, Schema AST 19 % self |
| package suite | 56 s wall | 337 s summed: reloads 55, three sweeps 110, four pair files 107, cli 32 |
| pair reach, no properties | 6.5 s | transfers' 1,000 seeds; 8 seeds (114 ms) give the same cells |

`runTurn` itself is 2.3 % (transfers), 1.2 % (session) and 1.8 % (palette) incl. Other `session/long` shares:
`withEntry` 5.7 % self, `graces` 6.3 %, `wave` 4.7 %. The palette stress run passes its 60 s limit; its
`indexOf` key sort alone is 9.7 % self. Sync's reach takes 3.7 s for 1,000 seeds and 11 ms for the 1 it needs.

Volume: the reloads check replays 272,044 steps to cover Stories that hold 1,739 steps in all, 156 times the
linear count, as 3,668 runs over 95 Stories. The three sweeps run every non-stress Story at every position.
Across all 148 Stories that is Σ(S+1)·S = 856,668 steps.

## Ranked findings

Costs are measured unless marked est. Effort is S (under a day), M (one to three days) or L. Home is where the
work belongs; the evidence, design and risk of each finding follow the table.

| # | Finding | Cost | Effort | Risk | Home |
| --- | --- | --- | --- | --- | --- |
| 1 | Pair sweep drives all 1,000 seeds | 107 s suite file time | S | none | T83 |
| 2 | Reload sweeps replay from boot per position | 165 s, 49 % of suite | M-L | medium | T83 |
| 3 | Every step re-encodes touched records whole | 23-76 % of a run | M | medium | T9 + T84 |
| 4 | Codec walks twice and sorts keys per object | 16-64 % self | M | low | T9 |
| 5 | Generic depth walk and Schema encode first | 19 % + 3 % (palette) | M | low | T9 |
| 6 | Whole-world scans keyed by built strings | 13 % `actorKey`; O(actors²) est. | M | medium | new Task |
| 7 | Whole-map copies per change | 5.7 % self; O(n²) est. | M | medium | new Task, T84 |
| 8 | Run rules re-judge every record at every cut | 18.6 % of reloads | S | low | T83 |
| 9 | Restore re-encodes to prove canonical form | 5-7.6 % | M | low | T9 |
| 10 | One Effect fiber per timer arm | est. 5-10 % | M | medium | new Task |
| 11 | Each boot re-validates Compiled | ~2 % of reloads | S | none | new Task |
| 12 | Context waves re-select every slot | 3-6 % | S | low | T9 + new Task |
| 13 | Generator view eager per pull | est., quadratic | S | none | T83 |
| 14 | Faults time is suite time under contention | over 5 min | S | low | T83 |
| 15 | Turn-path re-derivations | under 1 % each | S | low | T9 |

1. **Pair sweep.** Unsent, Resending and Cancelling are forbidden for every fixture, so the loop's
   `found.size < PHASES.length` never holds and all 1,000 seeds run. Evidence: `src/host/testing/sweep.ts#pairSweep`,
   `tests/generated/pairs.ts` (`DRIVE_SEEDS`, `FORBIDDEN`). Design: pass the phases the fixture can reach and stop
   when all are found. `found` keeps the first hit per phase, so the cells are identical.
2. **Quadratic reload sweeps.** Each variant replays from boot, and four files repeat the same prefixes. Evidence:
   `tests/rules/sweep.ts#sweep`; `tests/rules/reloads.test.ts` runs two per position plus 0, 1 and 3 reloads;
   `sweep-land` and `sweep-unattached`. Design: run each Story once and cut the world at each position (store,
   fakes, clock, held calls). Fork every variant (reattach, land, unattached, double reload) from that cut. Judge the
   shared prefix once and only the suffix per fork. Risk: the cut must hold everything a reload reads. Prove it once
   on every Story: fork and replay give equal evidence and stores.
3. **Step-end re-encode.** `project` → `writesOf` → `actorWrite` → `encodeActor` encodes the whole record of every
   touched identity at each step. The edge's dirty map, keyed by record key, then keeps only the last text. Palette
   stress re-encodes a 4,097-command memory each step, 4.6 ms/turn. Evidence: `src/core/persist.ts#makePersistence`,
   `src/host/edge.ts`. Design: encode each memory field by its compiled encoder, memoised by the field value's
   reference. Memory is immutable and keeps unchanged parts (Turn I30). Build the record's text from the field
   texts, and reuse the whole text when the record's parts are the same references. Risk: memory mutated in place
   would serve stale text. Enforce immutability with a dev-mode freeze or state it as the contract. R4's withheld
   rule is unchanged, since a failure is memoised by reference too.
4. **Two-pass codec.** `toCanonicalJson` builds a JSON tree and `toText` writes it out. `frameOf` sorts every
   object's keys per encode with `byCanonicalKey`, which calls `Number()` on each comparison. Evidence:
   `src/core/codec.ts#toCanonicalJson`, `#toText`, `#byCanonicalKey`. Design: write text in one pass. Take a
   Struct's sorted key order from `Compiled` once at compile time, and sort only Record and `Schema.Json` keys.
   Covered by the Codec T7 and fixed vectors.
5. **Generic pre-walks.** `jsonOf` runs `withinDepth` (a Map, a Set and an `Object.values` array per node), then a
   generic `Schema.encodeUnknownResult`; `selectedOf` does the same for selections. Evidence:
   `src/core/record-format.ts#jsonOf`, `src/core/depth.ts#withinDepth`, `src/core/slots.ts#selectedOf`. Design:
   one compiled, stack-safe encoder per Schema that checks depth and form and writes canonical text in the same
   pass (D27).
6. **World scans.** `actorKey` runs three `replaceAll` calls on every call. Each step's scans call it inside
   loops:
   - the context `wave` and `settling` check every incarnation against each bound provider;
   - `graces` checks every incarnation's lanes and timers;
   - `pendingOwners` and `lanesOf` read every lane;
   - `project` reads every owed row.

   Evidence: `src/core/world.ts#actorKey`, `src/core/context.ts`, `src/core/incarnations.ts`,
   `src/core/serve.ts#pendingOwners`, `src/core/tx.ts#makeTx`, `src/core/persist.ts#makePersistence`. Design: mint
   each identity's key once, with an `ActorId` that carries it. Keep per-World indexes updated in the same
   transition: provider → consumers, actor → lanes, incarnation → timers, and identities with queued rows. Risk: an
   index falling out of step with its facts. Derive each index in the setter that changes its fact, and test it
   against the scan.
7. **Map copies.** Each change copies a whole map:
   - `withEntry` on every set;
   - `touch` copies `touched`;
   - `enqueue` copies the mailbox and the mail map;
   - `disarmWhere` copies the timers on each match;
   - ledger `setRows` copies `owed`, so restoring owed rows is quadratic in rows.

   `recordOf` and `graphOf` also run on every `setIncarnation` and again at `project`. Evidence:
   `src/core/tx.ts#withEntry`, `#makeTx`, `src/core/persist.ts#makePersistence`, `src/core/ledger.ts#makeLedger`.
   Design: give each step a draft. Copy each World map at most once, on its first write, mutate the draft, and hand
   it on as the next World at the step's end. Build `recordOf` once per touched identity at `project`. Risk:
   aliasing, since `world0` and `tx.started` must never see the draft. Guard it with a test that freezes `world0`.
8. **Run rules.** The Codec I7 rule re-parses and re-canonicalises every stored record at every cut of every run,
   and writes each primitive through a Schema encode (`primitiveText`, 7.6 % of reloads). The 19 rules each walk
   the evidence alone, `turnRecords` scans from index 0, and `opensOf` spreads one array per step. Evidence:
   `tests/rules/records.ts`, `tests/rules/deliveries.ts#turnRecords`, `tests/rules/rules.ts`. Design: memoise the
   I7 verdict per (key, text) for the process, since the same records recur across thousands of variants. Write
   primitives as plain text, and index each turn's records once per run. The oracle stays independent of the codec.
9. **Restore.** `decodeCanonical` parses, then re-encodes the whole value to prove it canonical. The record is then
   decoded twice, through the `Schema.Json` head and then `memoryJson`. Evidence: `src/core/codec.ts#decodeCanonical`,
   `src/core/actor-record.ts`, `src/core/record.ts#decodeRecords`. Design: a compiled decoder per record kind that
   checks canonical order and form while it decodes, in one pass. Codec I4 still rejects every non-canonical text.
10. **Timer fibers.** The host forks one Effect fiber per timer arm, per call and per serve yield. Evidence:
    `src/host/driver.ts` (`perform`, `drainInbox`), `src/host/fibers.ts#makeFibers`. Design: give each Runtime one
    timer fiber that sleeps on `Clock` until the earliest deadline and holds a deadline queue; a disarm removes its
    entry. Calls stay as fibers. Measure the share first; the risk is timer order under `TestClock`.
11. **Boot validation.** Each Runtime boot runs `malformedOf` over every Compiled and copies it. That is about 3,700
    boots in the reloads check alone. Evidence: `src/host/runtime.ts`, `src/core/well-formed.ts#malformedOf`.
    Design: validate once per Compiled, at compile time or in a `WeakMap`, with no copy.
12. **Context waves.** `update` re-runs every selector through two Proxies and a full codec round trip, then
    compares with `Equal` on JSON. Evidence: `src/core/context.ts`, `src/core/slots.ts` (`selectedOf`, `sameForm`).
    Design: skip a slot whose provider snapshot is the same reference, and compare canonical text through the
    compiled slot codec. The skip is sound for pure selectors, which Actors R19 already requires.
13. **Generator view.** These run on every pull:
    - `held`, `batches` and `heldWrites` are built eagerly;
    - `calls` filters the whole call log for each endpoint, so its cost is quadratic in run length;
    - the reach search builds a full `RuntimeCut`, with every actor's snapshot;
    - refusal nudges run every try (`map` before `find`).

    Evidence: `src/host/testing/run.ts`, `fake.ts`, `generate.ts`, `sweep.ts`. Design: lazy view fields, a
    per-endpoint call counter, lanes read straight from the World, and a loop that stops at the first nudge that
    fires.
14. **Faults.** The control and dead-core runs each take the whole suite, beside 6 workers in 8 copies. A missed
    target falls back to the whole suite, and `judged` runs again without `--bail`. Evidence:
    `tools/faults/run.ts`. Design: findings 1 and 2 first; then set the number of copies from cores and memory (T83's
    guard sizes). The dead core keeps its full run.
15. **Turn path.** These re-derive per call what `Compiled` already holds:
    - `sameMemory` runs Schema equivalence over the whole memory on every update;
    - `chainOf` and `leafOf` split and join state paths, and `levelsOf` rebuilds the route per event;
    - `Schema.is(event.payload)` runs on every public send;
    - `nameCodec` is rebuilt for every name;
    - `keyTextOf` re-encodes the lane key on every guard and snapshot;
    - a commit encodes its input twice.

    Evidence: `src/core/turn.ts`, `src/core/tree.ts`, `src/host/driver.ts`, `src/core/identity.ts`,
    `src/core/lane-moves.ts`, `src/core/lanes.ts#makeLanes`. Design: compare only the patched keys, reference first,
    with the compiled comparator. Store each `Node`'s chain, depth, leaf and route levels. Bind `is`, the name codec
    and the key encoder on `Compiled` once.

## For the T9 lead (D27's compiled walkers)

Fold these into D27's encoder, decoder and comparator, because they share its walker:

- **Finding 5:** one pass that checks depth, encodes and writes canonical text. Drop `withinDepth` and
  `Schema.encodeUnknownResult` from `jsonOf` and `selectedOf`.
- **Finding 4:** the compiled encoder writes text directly. A Struct's key order is computed once at compile time,
  so only Record and `Schema.Json` keys are sorted, by a comparator that does not call `Number()` per comparison.
- **Finding 3:** the memo by field reference belongs in the same API. An encoder that returns cached text for a
  value it has already seen is what makes step-end projection O(changed fields). Without it, the per-step
  re-encode stays O(memory size) whatever the walker costs.
- **Finding 9:** a compiled decoder that checks canonical form in one pass replaces `decodeCanonical`'s parse plus
  re-encode, and the double decode.
- **Findings 12 and 15:** the comparator for `sameMemory` compares only the patched keys, reference first. Slot
  selections compare by canonical text. `EventEntry`, names, lane keys and commit inputs get encoders bound once
  on `Compiled`.

## For T83 (test speed)

Findings 1, 2, 8, 13 and 14 belong here; the T83 lead may change `tests/`, `tools/faults/` and `fixtures/`. Two
items need `src/host/testing/` (findings 1 and 13 change `sweep.ts`, `run.ts`, `fake.ts` and `generate.ts`), so
T83's "May change" needs that path, a small amendment. Order by gain:

- finding 1 (S, about 100 s of file time);
- finding 8 (S);
- finding 2 (M-L, the largest share).

Findings 3 to 7 make every Story run faster, so T83's new baseline should be measured after T9 and the new Task
below, or it will be set from today's slow core.

## For T84 (no caps)

Removing caps makes each per-step O(size) cost a scaling risk, so the bench budgets T84 sets should come after
these fixes:

- Finding 3: with no record or list cap, a large memory is re-encoded at every step (the palette's 4.6 ms/turn).
- Finding 7: `enqueue` copies the whole mailbox on each enqueue, so with no 1,024 pending cap, N pending events
  cost O(N²).
- Finding 6: `pendingOwners` reads every lane and its whole queue on each turn, so with no `serialize` cap of 64
  that cost grows with the queue.

T84's slow-work warning budget should be measured after findings 3, 6 and 7, or the warning will fire on Flow's own
overhead.

## Needs a new Task (proposed)

- **Core step structures:** findings 6, 7 and 11, and the skip in finding 12. This covers interned identity keys,
  a per-step draft of the World's maps, and indexes derived in the same transition: provider → consumers,
  actor → lanes, incarnation → timers, and identities with queued rows. `src/core/` and `src/host/runtime.ts`
  only. Acceptance: `session/long` per turn at or under half today's 0.179 ms; a Story with 1,000 actors
  shows per-step time flat in the actor count; every rule and fault green.
- **Host timer queue:** finding 10, if the bench split confirms it is over 5 %. Measure first and fold it into the
  task above if it is small.
- **Spec question for the user (not decided):** WriteAhead's realization projects records at each step's end. With
  the memo (finding 3) that is cheap, so no Spec change is proposed. Moving encoding to capture time would save
  more, but would move R4's "at a step's end" reporting, which is the user's call.

## Sidecar findings log

Four Haiku sidecars ran read-only sweeps at effort medium: (a) the turn and publish path, (b) persistence,
(c) test tooling, (d) blind. Each finding was re-read in the code and checked against the profiles. The cited
code is at HEAD a829ebe3.

**Accepted:**

- **a1** `pendingOwners` → 6.
- **a3** `sameMemory` → 15.
- **a5** `lanesOf` → 6.
- **a6** `disarmWhere` → 7.
- **a7** `enqueue` → 7.
- **a10** `wave` → 6, measured.
- **a11, a13, a14, d9, d10** context re-selection → 12.
- **a17, d17** lane key re-encode → 15.
- **a18** per-send `Schema.is` → 15.
- **a19, d13, d14** `nameCodec` → 15.
- **a20** `graces` → 6, measured.
- **b1** `recordOf` twice → 7.
- **b2** whole-memory re-encode → 3, measured.
- **b9** key sort → 4, measured.
- **b11, b12** map copies → 7.
- **b13** `project` owed scan → 6.
- **b15, b16, b17** restore → 9.
- **c1** reach seeds → 1, measured.
- **c2, c4, c5, c6** → 13.
- **c3, c15, c16** quadratic sweeps → 2, counted and measured.
- **c10, c11, c12** rules → 8.
- **c18** faults → 14.
- **c19** boot validation → 11, measured.

**Accepted, low** (measured under 1 %, merged into 15):

- **a2, a4, d1 to d8, d19** tree helpers.
- **a12, d12** `outsideOf`.
- **a15, b4, b5** `copiesOf` and `sameForm`, at about 1 %.

**Changed:**

- **b3** ("the edge rewrites unchanged records"): the edge coalesces by key. The real waste is encoding at each
  step, so this became finding 3. Skipping by comparing text is not proposed, since the Spec projects records
  without comparing bytes.
- **b7** ("codecs built per call"): the cost shows in Schema AST time (19 % on palette), but Effect's per-AST
  caching was not read, so it is folded into finding 5's compiled encoder rather than listed alone.
- **c9** `opensOf` (quadratic in steps): real but small, folded into finding 8.

**Rejected:**

- **c13** `oneIdOneInput`: few mints per run.
- **c17** profiles at collection time: `profiles.test.ts` is not among the 15 slowest files.
- **c8** shrinking in the default suite: `mix` 6.7 s and `planted` 2 s are bounded and not quadratic.
- **d20** `KINDS.find` at restore: three items per key.
- **b14** displaced-lane scans: empty in every profile.

Not answered: the cost of a single Effect fiber fork per timer (finding 10), and scaling past 14 actors (finding
6). Both are estimates until a bench Story with many actors exists.
