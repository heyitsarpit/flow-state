# Round 14 status

Prototype, for evidence; never production code.

## Checkpoint 1: area 1, lifetime (OD31) done

- Suite `--round 14 --runtime ../round-14/adapter.ts --no-search`: 800/800, locked, nothing unlogged, exit 0.
- `lifetime-falsify.ts`: control 48/48; 27 wrong runtimes all red; every LIFE case red on at least one.
- Not built: LIFE-19, 20 (Hydrate, dehydrate), 25 (records cliff), 26 (context providers); the ending phase
  (`stopped` input) and `NotAdopted` (no lazy entries).

## Checkpoint 2: area 2, identity (OD30) done

- `compile/ref.ts`: `actorRef` from a value or a literal name, `ensureArgs`; type pins in `typed/type-tests.ts` (tsc clean).
- Runtime: a record keeps the fields a value ref named it by; `OldVersionActor` at boot; `ConflictingActorRef`.
- R14-ID-01..03; 805/805 locked; falsify: 32 wrong runtimes red, every case red on one.

## Checkpoint 3: area 3, `Flow.ignore` and P1 (OD28) done

- Compiler: `Flow.ignore` in any operation mapping, D220's check skips it, `IgnoreForbidden` on stream keys and listen entries (front-check, 7 pins).
- Runtime: an ignored ending is admitted with no turn; its cell applies; an unknown is released (cancel in Held); never parked.
- `flow check`: `IgnoredUnknown` info. R14-IGN-01..03; 815/815 locked; 35 wrong runtimes red, every case red on one.

## Checkpoint 4: areas 4 and 5 (OD29 F, E step 2, target, G) done

- F: an absent `resetOn` value places nothing; present, the filling reads `key`; R14-F-01 (M8 impossible, the "A, none, A" walk).
- E step 2 and the optional target: type pins (no `signal` in contexts was already so). G: `Effect.catchTag` in `typed/lab.ts`, `typed/pay.ts`.
- J: not built (the prototype has no typed entity API). 818/818 locked; 38 wrong runtimes red.

## Checkpoint 5: the independent review at 48d1dc46, fixed or stated

- H1 fixed: an ignored unknown counts as mapped; no `UnresolvedHold` for it (CLI pins: `IgnoredUnknown`, removeFile, ignore.ts's send and put).
- H3 fixed: the end encodes the record with `record.ts`'s codec; the test-only `codec` input is gone; LIFE-22 poisons memory with a bigint.
- M1 fixed: arming or disarming a schedule key drops its waiting deadline; an ended activation's waiting deadline goes; LIFE-14 re-arm variant.
- M2 fixed: a return after an end mints a new root id (an old ending is adopted, current from the active leaf: my call, rule 14's adopted row);
  a record kept at ready keeps its id, as a live restore does. The same-incarnation invariant covers kept reads and endings owed at ready.
- M3 fixed: identity fields encode by their Schemas to strings; the version is field set plus each field's Schema (type and encoded side).
- Item 7: LIFE-13 kept, with a comment naming the design hole.
- M5 and the rest, stated, not built:
  - `ScheduleLeadsToWrite` (flow check) is not built.
  - Story `detach` and `dispose` exist in the suite's harness steps only, not in `round-14/story/story.ts` (no app Story there).
  - `EndedWithWork` and the end's record list schedules and reads, never activities or sessions.
  - Inspection's `uses.busy` lists write lanes, kept reads and owed endings; not mailbox depth, waiting deadlines or the unencodable block.
  - `IdentityFieldOptional`, the read-only input pin (OD30 Q5), `InputIgnored`, and `ConflictingActorRef`'s persist and context half are not built.
  - G: `typed/lab.ts` and `typed/pay.ts` call `catchTag` through an `as never` each (a generic error type); the hand `fixtures/*.compiled.ts` are unchanged.
  - E step 2 is pinned for a commit's context only.
  - `soon` and `warned` are out of the state hash (diagnostics only).

## Checkpoint 6: the user's corrections D1-D7 done; final gates in RESULTS.md

- D1: an end parks `failure { Interrupted }` per stopped read; the return hears it after its restored deliveries; LIFE-13 flipped.
- D2, D3: as M1, M2 above. D4: the ref form is fixed per machine in the types; `ConflictingActorRef` only for persist mismatches.
- D5: a local remount within the grace reuses the actor (LIFE-27). D6: a disposed identity's ending waits on its lane (LIFE-23).
- D7: an undecodable identity reads "quarantined"; an ensure starts fresh and reports `RecordUndecodable` (evidence).
