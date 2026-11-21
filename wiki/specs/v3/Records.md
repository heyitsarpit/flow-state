# Records: companion to the Records Spec

Status: proposed. This holds what does not fit @spec.Records: the walkthrough, the problem classes, the principle
ledger, the fit to today's code, the user's calls, the open holes and the process notes. The Spec is pre-coding
analysis, best-guess guidance, revisable whenever building shows it wrong; each change is recorded in
`wiki/specs/specs.log`. Nothing here is decided by the user; every call below is proposed.

Terms (`Fate`, `Carried`, `Waits`, `Starts`, the `Shape` types, `RefRows`) are the Spec's `model` and `algorithm`.
Other Specs are named in backticks: `Schedules`, `Changes` (the turn walk), `Operations`, `Types`, `Host`.

## 1. Walkthrough: a payment saved mid-flight, reloaded under a new build

Build A of the shop fixture is paying: `Checkout/Pay` `checkout-1` is in `PAYING`, its `pay` Attempt is out, and
the `slow` timer is due at 9000. The store holds three records (format 6):

```
key   actor/Shop/Cart/{"owner":"main"}
text  {"body":{"graph":{},"instances":{},"memory":{"adding":"","errors":{},"lines":{"a1":2},"notice":"",
       "wanted":{}},"schedules":{},"slots":{"shopper":{"baselines":{},"provider":{"machine":"Shop/Shopper",
       "name":"main"},"seen":{"value":"Elif"}}},"state":"OPEN"},"format":6,"shape":"c41a"}
key   actor/Checkout/Pay/checkout-1
text  {"body":{"graph":{},"instances":{},"memory":{"busyTries":1,"cartId":"main","intentId":"pi_1",
       "totalCents":900},"schedules":{"slow":{"arming":{"_tag":"Due","armedAt":1000,"attempt":0,
       "dueAt":9000}}},"slots":{},"state":"PAYING"},"format":6,"shape":"s81c"}
key   work/Checkout/Pay/checkout-1
text  {"body":{"lanes":{"":{"Checkout/pay":{"{\"intentId\":\"pi_1\"}":{"displaced":[],"head":{"attempt":
       "att-3f-1","claims":[],"hold":"Out","rest":{"paymentMethodId":"pm_1"},"retryCount":0},
       "queue":[]}}}},"rows":[]},"format":6,"shape":"s81c"}
```

The tab dies. Build B loads: it renamed Pay's memory field `busyTries` to `tries` and dropped the `slow` schedule.

1. **Stage 1 (no definition).** Each key parses, each text is canonical, each envelope is `{body, format, shape}`,
   each body fits its kind's strict shape, and `att-3f-1` occurs once in the work record. Three records, two
   identities.
2. **Stage 2 (the reference table).**
   - Cart: every name reads. `Live`, not dirty. Nobody owes it anything, so it stays a record and sleeps.
   - Pay's position: `PAYING` reads. `busyTries` is absent from B: dropped, reported once as
     `FieldDropped { machine: "Checkout/Pay", field: "busyTries", count: 1 }`. `tries` is absent from the record:
     it takes its declared initial. `slow` is absent from B: its timer is dropped and never fires. `Live`, dirty.
   - Pay's work: the contract, the key text and `rest` read. The head is `Out` and no wire survived the reload,
     so the boot gives a Held head that owes one unknown `Restored` (Spec, Lanes and rows). `Live`, dirty.
3. **Start.** Pay has a `Live` position and is owed an ending, so the boot wakes it. Its `Start` delivers the
   unknown; the machine moves to `UNSURE` and arms `check`. The capture after that turn writes Pay's two records
   in one batch: the position without `busyTries` and `slow`, and the head as `Held` with no unknown left. A
   second reload tells nothing again.

What the user must see: the charge is never sent twice, the unknown is heard once, the renamed field's value is
gone (a rename is a removal and an addition; no migration API exists), and the cart is untouched. Had B removed the
`pay` operation instead, the lane would be carried byte for byte and reported, and a `forget` or a build that
declares `pay` again would be its exits.

## 2. Problem classes

A family is **removed** only when a type or signature cannot express a member; otherwise it is handled at one
named point.

| #   | Family                                    | Known members                                                                                                                                                                                        | Handling                                                                                                                                                                                                                 |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | A fact stored twice can disagree          | identity in key and content; lane key text against the head's input; one Attempt in a lane record and owed rows; a claim row beside its lane; `graph`                                                | **Removed** for identity (no `Shape` field holds it) and for an Attempt's unknown (a head has one slot for it). **One point** for the input: `rest` is read only merged with the key's fields. `graph` is debt (hole H2) |
| F2  | The reader accepts what no writer emits   | shapes a reader allowed that no writer emits; reason sets wider than writers; `Schema.String` identifiers; excess fields; empty containers; lane and owed formats 1 to 4 read by the format 5 Schema | **One point:** each kind has one strict, normal-form `Shape` codec used in both directions, plus the round-trip run rule (I1, I2). Identifiers are brands with one constructor (**removed**)                             |
| F3  | Validity spans rows or records            | an ending then another row of one Attempt; a Held head beside its success; a head whose unknown is told twice across reloads                                                                         | **One point:** `attemptsOnce`, one filter in the work codec; every relation is inside one record, so stage 1 sees it. The told-twice member is **removed** (no second slot)                                              |
| F4  | A name the definition lacks               | state, field, slot, schedule, key, reason, selection, instance, operation, subject, entity, contract                                                                                                 | **One point:** the reference table, total by type: a body map without a row does not compile                                                                                                                             |
| F5  | Format steps                              | five designs, one number; lane and owed have no steps; a step that reads the definition; nobody deletes the old key                                                                                  | **One point:** one step table over whole identity groups, total by type; steps read no definition; the write of `work/X` removes the legacy keys it replaces in the same batch                                           |
| F6  | No fault model                            | "forged-but-valid" tests held for the user                                                                                                                                                           | **Proposed here** (Spec `model`, FaultModel), as question 1                                                                                                                                                              |
| F7  | Records the boot cannot judge yet or ever | lazy machine, removed machine, newer build, unknown kind, a machine now `persist: false`                                                                                                             | **One point:** the fate table; reading structure needs no machine                                                                                                                                                        |
| F8  | A second writer of the store              | the boot writing endings; an owed write over a quarantined key                                                                                                                                       | **Removed:** the boot returns no `StoreWrite`; `capture` is the only writer and filters by fate; `install` only marks keys                                                                                               |
| F9  | Two paths that must agree                 | boot, adoption, hydrate                                                                                                                                                                              | **One point:** `admit(source, texts)` then `install`                                                                                                                                                                     |

## 3. Principle ledger

| Principle                                 | Held or traded                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classes, not instances                    | held: section 2                                                                                                                                                                                                                                                                                                                                                                                                                          |
| One owner per state, one writer per field | held: `capture` writes; `fate.ts` owns S2 to S5                                                                                                                                                                                                                                                                                                                                                                                          |
| Store facts, derive views                 | held: fates and reports are derived each boot; no app digest is stored. `graph` is the debt (H2) traded once: a format 5 `Held` head with no row is told `Restored` once more after the upgrade (question 9), because format 5 saved no fact that says it was told                                                                                                                                                                       |
| Explicit states                           | held: `Fate`, `hold` with its `unknown` slot, `Cell`                                                                                                                                                                                                                                                                                                                                                                                     |
| One decision per subject per occasion     | held: one fate per key per `admit`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Total tables                              | held: stage 1, fates, the reference table by type; the lanes-and-rows table                                                                                                                                                                                                                                                                                                                                                              |
| Survives a reload                         | held: I1                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Same rule at every scope                  | held: instance rows reuse the position rows; lanes carry their subject                                                                                                                                                                                                                                                                                                                                                                   |
| One equality and one codec per fact       | held: canonical text; `Compiled.saved`                                                                                                                                                                                                                                                                                                                                                                                                   |
| A throw changes only its own check        | traded once: detection is per leaf (`decodeBy`), and a `slots`, `baselines` or `graph` leaf that does not read is dropped alone; a `memory` field that does not read resets its position (the actor restarts from the definition's initial state and memory), because a position with one field put back to its initial is a state the machine never reached (nothing invented). The work side is untouched (I11). Proposed: question 13 |
| General                                   | checked in section 6                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Simple                                    | traded once: the work record is rewritten whole (question 2) to remove the cross-record relation                                                                                                                                                                                                                                                                                                                                         |
| Cheap operations                          | traded: a capture rewrites the whole `work` text, O(b) in its bytes (question 2); the bench decides                                                                                                                                                                                                                                                                                                                                      |
| Effect at the edges                       | held: the core uses `Schema`, `Result`, `Option`, `Data` only                                                                                                                                                                                                                                                                                                                                                                            |
| Types derive from their source            | held, with the codec spike (H3) and the type proof (`Types`) owed                                                                                                                                                                                                                                                                                                                                                                        |

The throw family rule shared with `Schedules`, `Changes` and `Operations`: a user read that throws changes only its
own check. (1) Its field is `Failed(f)` and an issue names its slot. (2) Every decision that needed the value is
made as if the read had returned its last clean value; a subject with no clean value yet uses the neutral one. (3)
The next occasion reads again; the first clean read after a failure is compared with the last clean value, or
becomes a silent baseline. (4) Inside a turn, a callback the turn must run to compute its own result is the turn's
check: the turn is `Refused` and nothing else changes. This Spec's member is a Schema decode per leaf, with
question 13's one stated trade.

## 4. Fit to today's code

Verdicts: keep, change, delete. "Callers" says who is affected. Coders use this to know which code is redundant or
to be superseded.

| Code                                                                                             | Verdict        | Why; callers                                                                                |
| ------------------------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------- |
| `codec.ts` `decodeCanonical`, `encodeCanonical`, `parseCanonical`                                | keep           | stage 1 row 2; `decodeCanonical`'s one caller is `record.ts:415`                            |
| `record-format.ts` `FORMAT`, `Format`                                                            | change         | 6; `Format` becomes `1..FORMAT` as a type for the step table                                |
| `record-format.ts` `decodeBy`, `textOf`, `reasonOf`                                              | keep           | the leaf decode; callers `record.ts`, `actor-record.ts`                                     |
| `record-format.ts` `ActorJson`, `actorOf`                                                        | delete         | identity is not in content                                                                  |
| `record.ts` `decodeRecords`, `identityIn`, `rowOf`, `rowsRecord`, `laneRecord`, `keyNamesItself` | delete         | replaced by `structure` and `admit`; one caller, `incarnations.ts:424`                      |
| `record.ts` `encodeLane`, `encodeOwed`, `rowJson`                                                | change         | one work encoder; callers `persist.ts` `laneWrite`, `owedWrite`                             |
| `actor-record.ts` `encodeActor`, `decodeActor`                                                   | change         | the position codec over `PositionShape`; callers `persist.ts`, `record.ts`                  |
| `actor-record.ts` `stepsTo`, steps 1 to 3                                                        | keep as rows   | rows of `steps`                                                                             |
| `actor-record.ts` `stepFour` (`:376-400`)                                                        | change         | reads the machine today; becomes definition-free                                            |
| `identity.ts` `decodeName`, `inputOfName`                                                        | keep           | the only maker of `ActorName`; callers `record.ts:393`, `incarnations.ts:259`               |
| `world.ts` `actorKey`, `laneId`, `restoredLaneId`, `restoredAttemptId`                           | change, delete | encoders of `RecordKey`; the two `restored*` casts go                                       |
| `world.ts` `Quarantine`, `World.quarantined`                                                     | change         | `Fate`, `World.kept`; `Quarantine` names two things today (`world.ts:524`, `driver.ts:79`)  |
| `persist.ts` `capture`, `byIdentity`, `withhold`                                                 | change         | filters by fate; a `work` write removes its legacy keys                                     |
| `persist.ts` `markMailbox` (`:345-351`), `graphOf` (`:76-96`)                                    | change, keep   | mark from the tx's touched rows; `graph` stays (H2)                                         |
| `persist.ts` `laneWrite`, `owedWrite`, `actorWrite`, `liveText`                                  | change         | two writes per identity; the memo stays                                                     |
| the boot's writes (`saveOwed`, `saveLane`, `incarnations.ts:446-456`)                            | delete         | `install` marks keys and `encodeStore` is the one writer                                    |
| `ledger.ts` `restore`, `start` (`:338-412`)                                                      | change         | rows built once; the head's unknown from its slot; `Origin.HeldAtStart` goes (`Operations`) |
| `incarnations.ts` `boot` (`:423`), `reportUnbound`                                               | change         | `install`; `UnboundLane` stays a derived report                                             |
| `schedule-plan.ts` `savedTimersOf`, `schedule-restore.ts`                                        | change         | `Schedules`' decode table through the reference rows                                        |
| `vocabulary.ts` `SavedTimer`, `ReadFailure`                                                      | change         | `TimerShape`; `ReadFailure` codes become fate reasons                                       |
| `host/store.ts`, `host/platform/indexeddb.ts`, `host/edge.ts` (one batch out)                    | keep           | the contract the fault model relies on                                                      |
| `host/close.ts` forget                                                                           | keep           | removes every key of the scope or identity                                                  |
| `tests/rules/records.ts` `recordKinds`                                                           | change         | gains I1 and I2                                                                             |
| the error catalog (`CATALOG`)                                                                    | change         | one more row, `RecordNotPersisted` (class Failure, issue false, report true)                |

The code audit counts 75 lines of record code to drop; this design deletes the hand checks of `decodeRecords` (about
200 lines) and adds `record-key.ts`, `fate.ts`, `shape.ts`.

## 5. Seams with other Specs

The Offers, Needs and per-Spec hand-offs are in the Spec's `composition`. What each other Spec must answer:

- `Changes`: its `Dropped` row must also cover "the instance's memory or reset value does not read".
- `Operations`: accept the single-slot unknown and the "final answer replaces an unheard unknown" table; give
  `SavedEnding` per contract; derive the retry and idle guards from the lane head.
- `Types`: prove `RefRows` total; give `Compiled.saved`; derive `Position` from the definition.
- `Host`: the run rule, the hostile store fake and `flow explain` reading fates.
- Hydrate's merge (the entity store's) stays open (hole H4).

## 6. Fixtures read against the design

**shop** (value-named carts, reject and latest lanes, Pay's three schedules, a renewal Pay per subscription);
**transfers** (NFC and NFD names stay two identities, since names are compared as text; a schedule armed by an event
only); **home** (keyed `poll`, `pausedBy`, a deadline from memory); **session** (maps, sets and `Option` in memory;
JSON 100,000 deep; 20 persisted machines; the lazy entries of the catalog); **sign-in** (`Flow.private` is saved
today; this design does not change that, H6); **command-palette** (a 300,000-entry position: why the work side is a
separate record); **sync**, **player**, **number-input** (nothing saved: I12).

## 7. Questions for the user

Items 2, 3, 4, 5, 7, 8, 11 and 12 are decided by the agent pass of 2026-11-22 (the Spec's Q6), each by the trace
beside it. Items 1, 6, 9, 10 and 13 (and `persist` turned off, R8) are the user's calls: they stay proposed, and
the trace beside each is the reasoning.

1. **The fault model** (proposed, recommend A; user call). A: Spec `model`, FaultModel; "forged but valid" is out of
   scope, its `it.fails` tests are deleted, and the caveat is written into R2. B: defend meaning against forgery,
   which needs signed records. Trace for B: a copied, valid record under its own key cannot be told from a real one.
2. **One `work` record per identity** (agent-answered A). A: lanes and owed rows merge; no relation spans records;
   the cost is a whole-record rewrite per acknowledged send. B: keep per-lane records and add a boot-wide check.
   Trace for B: a per-record decode passed a head beside its success.
3. **A head carries its one unknown** (agent-answered A, once: the Operations design cites this). A: Lanes and rows.
   Four visible effects: an unknown is told once across reloads; a final answer replaces an unknown not yet heard
   or kept; a head owes at most one unknown, so a second one before the first is heard is not told separately;
   after a reload an unheard unknown from the wire is told with the heads, after the saved rows. B: keep unknown
   rows beside heads. Trace for B: an unknown heard once per reload.
4. **No version tags in keys** (agent-answered A). A: nothing is re-keyed; an old-version record is one whose name
   or key does not decode. B: `@tag` keys. Trace for B: no writer removes the old key; a tag is a second place
   identity can disagree.
5. **An unreadable obligation is carried, not delivered** (agent-answered A). A: Carried. B: deliver without
   input. Trace for B: the user's ending mappers take `(value, { input, key })`; with no input the mapper cannot
   be called.
6. **An orphan is kept** (proposed, recommend A). A: `Kept(Orphan)`; `Kept(NotPersisted)` follows the same rule: a
   record this build does not read is left as it is. B: discard. Trace for B: a deploy that drops a machine by
   mistake destroys its users' data before the fix ships.
   ```ts
   // a build that no longer declares `Cart`: before: its records are discarded      after: Kept(Orphan), reported
   ```
7. **Claims live in the lane head** (agent-answered A). A: Spec, Data layer records. B: a claim row per Attempt in
   an entity-store record. Trace for B: a claim row whose head is gone leaves a field unconfirmed forever.
8. **`Compiled.saved`** (agent-answered A, once with the types design). Trace against: a changed key Schema
   restores and routes to the wrong timer.
9. **One step, 5 to 6, and it tells a format 5 hold once more** (proposed, recommend A). A: the format lands as one
   number; a format 5 Held head with no row is told `Restored` once after the upgrade, and a format 5 owed row not
   tied to a head is carried, not delivered, because format 5 saved no input for the ending mapper. Format 5 was
   never released, so only fixtures hold such rows. B: 6 for one change and 7 later; or treat such a head as told.
   Trace for B: a hold never told is lost.
10. **The earlier saved-record choices on item removal, newer builds and carried obligations** (proposed, recommend
    A): adopted as that concept proposed them; the obligation rule is Carried; a newer build's record is
    `Kept(Newer)` for the whole identity.
11. **One `admit`; positions are not saved by hydrate** (agent-answered A). The merge details are not settled here
    (hole H4).
12. **A reset actor is not woken by the boot** (agent-answered A). A: what it is owed waits for the ensure that
    starts it fresh, as a disposed identity's rows do today. B: the boot starts it fresh at once. Trace for B: a
    fresh actor nobody mounted hears an ending and runs effects with no view.
13. **A memory field that does not read** (proposed, recommend A; user call). A: the reference row stands; the
    position resets (state, all memory, timers and instances), the work side is untouched. B: reset only that field
    to its declared initial. Trace for B: a position with one field put back to its initial is a state the machine
    never reached.
    ```ts
    // memory field `total` no longer decodes (the Schema narrowed)
    // A: the actor restarts from its initial state and memory; reported RecordUndecodable
    // B: only `total` takes its declared initial; the rest of the position is kept
    ```
14. **A record of a machine now declared `persist: false`** (proposed, recommend A; user call).
    ```ts
    // definition({ id: "cart", persist: false })           // an earlier build saved cart records
    // A: Kept(NotPersisted): left unread, reported once    B: removed at boot, and what the record owed is lost
    ```

## 8. Open holes

Each now has a home:

- **H1.** Earlier requirements against these tables: the Spec's Q3, checked by @task.V3.T92's requirements review.
- **H2.** `graph` stored twice: a build-time choice in @task.V3.T92's description.
- **H3.** `codecSig`: a build-time choice in @task.V3.T56's description (Q4).
- **H4.** Hydrate's merge: designed in @task.V3.T115's Spec.
- **H5.** Streams and bookmarks: @task.V3.T25 (no design yet); `bookmarks` stays reserved.
- **H6.** `Flow.private` in clear text: decided in `Operations` (its answered table).
- **H7.** A rollback rule for a later format that moves facts: decided when such a format is proposed; format 6 moves
  none.
- **H8.** The order of Attempts on one entity record: designed in @task.V3.T126's Spec.
- **H9.** The stage 1 re-encode cost: a bench row of @task.V3.T92.
- **H10.** Prior art: closed as stated; no design rests on a survey.
- **H11.** `Flow.input` in saved memory: a build-time check in @task.V3.T92's description.
- **H12.** The entity record's reference rows: designed in @task.V3.T125's Spec.
- **H13.** The executable model's gaps: the Spec's T1 to T3, run by @task.V3.T92 before its build.
- **H14.** The types: proved by `Types` (its Q14) once the shapes are code.
- **H15.** Removing a kept record by hand: decided, no CLI path; the CLI stays at check, explain, graph, story and
  trace, and `forget` or a build that reads the machine again removes it.
- **H16.** "Stays in `displaced`, Carried": decided, the wording stands; both readings gave the same results.

## 9. Process notes

- **What went wrong:** reviews served as the specification. No fault model and no list of what writers emit existed
  before the build, so each review forged one more contradiction; samples varied one dimension at a time; two
  checks could not fail.
- **How to build.** First the answers to questions 1 and 2, since every table rests on them. Then, in order:
  `record-key.ts` with its round trip; the `Shape` codecs with I2 as a run rule on today's Stories (red first: it
  fails on every format 5 text); the step table with the `lanes/upgrade-5-to-6` Story; `fate.ts` and the
  reference table, one map at a time, each with its mutation row; `capture`'s fate filter; then the stamp.
- **First failing checks:** `shop/told-once` (today's `it.fails`), `shop/answer-beside-hold`, `shop/bound-to-local`
  (today's `it.fails` at `restore.test.ts:327`), and I2 over the generated mutations.
- **Where a review pays:** once, after the `Shape` types and `RefRows` compile and before any Story is written, by
  an adversary allowed only the tables. An adversary found 22 items in seven minutes from the tables alone.
- **Generator before samples:** build the mutation generator (Spec `tests`, Alphabet) first; hand-picked forged
  records are what kept the earlier work open.
- **The model is cheap:** about 40,000 cases in seconds. Keep it in the package's tests beside the Spec and re-run
  it on every table edit; a model that lives in a scratch file is lost.
- **Seams need an owner in both Specs:** the Offers and Needs lines in the Spec's `composition` exist for this.
