# Convergence 11: the suite on typed output

Status: **everything here is proposed.** The calls are the builder's, under delegation, for Arpit to overrule. Decisions start at D194. Inputs: `HANDOFF.md` (plan cut, step 2), `codec/BRIEF.md`, `round-7/review.md` ("`Compiled` and the typed path"), `round-10/typed/`, `round-10/RESULTS.md`, and a census of what the suite boots (`round-11/typed/census.ts`, run at the start of this round).

Written before this round's code. The census numbers below are from that first run [ran]; the codec's numbers are filled in after the codec stage, and marked where they land.

## What the suite boots today [ran: `round-11/typed/census.ts` on round 10's runtime, copied]

- **368 `Fixture` objects, 50 machine ids**, made over 742 cases. Most are made per case by a factory (`Lab/Bare` 97 objects, `Lab/Chat` 70, `Lab/Chain` 34, `Lab/Edge` 31, `Lab/Kept` 26). So **a swap by `Fixture` identity, as `--swap` does, cannot reach most of the suite**: it reaches Pay and pay-full's two fragments only.
- **Bare functions** (a function in `Compiled` that is not a Slot's `run`): every hand fixture but `Form`, `Checkout/Addr`, `Desk/Ticket`, `Lab/Getter`, `Lab/EachReset` has some. Round 7's review counted 117 over 35 machines; the census counts per object, and the classes are: `commit` (every hand op), domain closures (`reads`, `confirms`, `repair`, `version`, `listens`), stream closures (`key`, `backoff`, `subscribe`, `reconnectWhile`).
- **Duplicate Slot paths: 14 distinct**, in `Issues/List` (3), `Desk/Attach`, `Lab/TraitWrite`, `Desk/Editor`, `Deep`, `Desk/Queue`, `Drv` (5). Two kinds: one `Mapped` reused under two endings (`operations.like.failure` for two reasons), and `Drv`'s path that names a member, not its alternative.
- **Non-finite numbers in data: 1**, `Lab/Engine`'s `streams.changes.idleMs: Infinity`.

## Findings, by root cause

| Root cause | What was assumed, and is false | Findings |
| --- | --- | --- |
| **1. `Compiled` is proven by data no compiler emits.** | That the runtime's green on hand-written `Compiled` says something about what a compiler would hand it | 368 objects hand-built; bare functions in all but five machines; 14 duplicate paths; `Infinity` in data; `on.on.` in the hand Pay's paths (round 7 review); `--swap` reaches 3 machines |
| **2. Where the public API has data, `Compiled` has closures.** | That a closure is as good as the declaration it came from, for the runtime and for the tools | `key` closure beside `keyFields`; `memory` as three closures, not fields with Schemas; domain and stream closures slotted at the seal under shared paths (`domain.read` for every read); `commit` bare allowed |
| **3. The way to load `Compiled` was never measured.** | That `JSON.parse(JSON.stringify(compiled))` and a code table is the production path | `codec/BRIEF.md`: three options, no numbers; `structuredClone` cost guessed from Bun |
| **4. A test's machine is identified by an object, not by what it is.** | That a fixture is one object per machine | Factories per case; `swapFixtures` keyed by identity |

## Decisions, proposed

| Id | Decision | Why | Replaces |
| --- | --- | --- | --- |
| **D194** | **No runtime codec for `Compiled`: in-process.** Production imports the typed module; `machine()` is the compile and its output is what the Runtime boots; a Slot's `run` is the author's closure. `toData` (`round-11/codec/codec.ts`) is the data view for tools, Stories and snapshots, never loaded at run time; `CompiledData`, an Effect Schema of that view, is the contract, checked by the suite, not at each boot. Persisted records stay a JSON string | Measured (RESULTS, "The codec"): in-process is the cheapest load warm and cold, keeps every value, and is the only form where the suite's object *is* production's. The data and module forms cannot avoid evaluating the definition, since a Slot is a closure over the author's module, so they only add parse and rebind on top. The Schema as a per-boot codec costs 4-6x the compile. Chrome: a string put beats an object put | `JSON.parse(JSON.stringify(...))` with a code table as the plan (HANDOFF step 8) |
| **D195** | **The typed fixtures replace the hand ones as what the suite boots; the hand ones stay, unchanged, as prior art and as the other side of `--swap` and `compare`.** Typed modules in `conformance/fixtures/typed/` export the same names and signatures as the hand modules; scenarios and searches change their import path only. A case's body hash does not move, so "the same suite" is shown by the lock: no case id's line changes, only `file:` lines | Root cause 4: factories cannot be swapped by identity, so the swap is at the import. The hand files staying byte-identical keeps Pay pinned and lets `compare` diff every machine | `--swap` as the only typed pass |
| **D196** | **`--swap` turns around:** it boots the hand fixtures where a typed one has a hand twin by identity (Pay, pay-full), so the pinned Pay still runs every gate | Pay stays the pinned reference | `round-10/typed/swaps.ts` (hand → typed) |
| **D197** | **Behaviour is held by whole output.** `expected-output.txt` was written on hand fixtures; the typed suite must print the same output per case. Any case whose output moves gets its own log line with the specific reason, or the typed fixture is wrong | The suite's own change detector (D134) is the strongest "behaviour did not change" check it has | |
| **D198** | **Where a fixture cannot be written in the public API, that is a finding**, recorded in RESULTS with which side is wrong (the fixture, or the API) | Brief | |

### The front end, grown for the port (D199-D206)

Each from the design where it has one; names the thin path chose are said. All in `conformance/typed/flow.ts`.

| Id | Decision | Why |
| --- | --- | --- |
| **D199** | Fragments declare `operations` (rule 49); their endings map onto the fragment's own events; the machine collects every fragment it places (by value, in `traits`, `into` or `places`) and hoists their operations with `fragment:` set. Two of one name is `DuplicateOperation` (rule 51) | Hand fixtures put a fragment's op on the machine by hand |
| **D200** | Memory: `Flow.initial(schema, start => value)` (2.2.2's computed start), `Flow.absent(schema)` (2.2.2's "an optional key starts absent", named so every field has a `Flow` source), and a `Flow.input` missing from the input takes the Schema's decoding default for a missing key | Hand memories default inputs (`i?.who ?? "a"`) and add fields in patches |
| **D201** | `unknown: { byReason }` in `outcomes` | `Compiled` had it since M6; the front end did not |
| **D202** | `O.x.idle` with no key, as a guard; `O.x.idle(key)` as before | `Compiled`'s key-less token (rule 21) had no typed spelling |
| **D203** | `labFollowUps` on an alternative: **not public API.** A head insertion of the machine's own event, which the design leaves to the runtime (pending resets, adoption, rule 54). Kept as a named seam so ORDER-*, Notes, Kept and the serial Bare still boot from the front end; counted apart in RESULTS | Finding F4: hand fixtures drive a runtime mechanism directly |
| **D204** | Raises: `E.<child>.<Event>`, with `.key(f)` for one copy of an `.each` and `.from(f)` for a payload; a machine declares `places` as a fragment does | 2.2's `E.pager.Jump.from(f)`; rule 9's keyed raise |
| **D205** | The front end and the typed fixtures live in `conformance/typed/`, not in a round: they are what the suite boots, and no runtime. The fake world is an Effect service (`FakeApi`), provided by `make(api)`, as Pay's `ShopApi` is | A round's folder holds a runtime; a typed fixture in it would move every round |
| **D206** | **A Slot's path is its place in the definition:** a failure's mapper is `operations.<op>.failure.<Tag>`, not the hand fixtures' `operations.<op>.<Tag>`, which collides with `success`, `unknown`, `key` and `commit` for a tag of that name. The scenarios' 10 fault addresses follow | The suite addresses faults by path, so the path is part of its contract |

Found by the port, fixed: a bare state token (`On: S.A`) compiled as a history target, since the token carries `.history`.

`Compiled` changes are collected in the table below as the fixtures are ported, and made once, together (D207 on).

### Later in the port (D207-D212)

| Id | Decision | Why |
| --- | --- | --- |
| **D207** | **Every closure in `Compiled` is a Slot, and a path names one.** The Runtime's seal no longer slots a bare function: one walk of the whole table refuses a function that is not a Slot's `run` (`SealUnknownClosure`, D77's word) and two Slots of one definition at one path (`SealDuplicatePath`). A hand fixture's bare `commit`, domain and stream closures are slotted by the suite before boot (`conformance/legacy.ts`), each under its own place's path (not `domain.read` for every read) | The compiler never emits a bare function; the seal was the hand fixtures' shim. With it in the suite, the production contract is strict and the hand fixtures still run where a case needs them |
| **D208** | Module members (`moduleMember`) and `activities` in a state's or a trait's body, in `Compiled`'s shape | Chat, DeskFeed, Rooms, Engine, Desk/Tickets |
| **D209** | `definition({ domain, streams })` in `Compiled`'s own shape, every closure a Slot under its own path. Not the design's entity or stream API | 342 cases boot an entity or stream machine; this puts their machine part on typed output and proves `Compiled` carries the module data as Slots. The design's API compiling to it is steps 3 and 4 (F5) |
| **D210** | Not made: `idleMs: Infinity` stays a number. In-process (D194) it is one; the data view names it a loss | Absent-for-unbounded would change when a timer is armed (`sessions.ts:120`), so behaviour; owed with the stream contract's typing |
| **D211** | **The Runtime takes the machines' services at boot** (`Fixture.services`, `BootArgs.services`); every fiber runs with them at its root (`Effect.runForkWith`). No `Effect.provide` around a commit | Answers round 7's "whether a Runtime takes a layer": yes. F10: `provide` per commit is a step a seeded scheduler sees (DRV-01's wire order moved with it, and back without it) |
| **D212** | `labHostOp(op)`: a host acting on its fragment's operation, a named seam | Rule 50 forbids it; three hand fixtures do it (F3, review M5) |

## Findings of the port (D198)

Each says whether the fixture or the API is wrong.

| Id | Finding | Which is wrong | Cases |
| --- | --- | --- | --- |
| F1 | A fixture writes a value its contract or memory Schema refuses (`GoBad`'s `1n`, `NoteGetter`'s class, `DoBad`'s `Set`, Getter's throwing getter), to test the runtime's door | Neither: the types refuse it, so a cast writes it; the runtime's door is what the case pins | about 10 variants |
| F2 | A lane key that is not a projection of the input: `() => new Set()` (Doors' `readKey`, Kept's `oddKey`), `BigInt(i.o)` off a string input (Kept's `keyed`, Edge's `big`), a renamed field (`{ key: i.k }`, KeyRelease's release 2) | The fixture, for the public API (review M4): no compiler emits these keys. They are runtime-only robustness cases on a shape no compiler emits, kept on the hand machine. A design question for Arpit: should the door carry an input by its contract Schema's encoding (`toCodecJson`: a bigint becomes a string)? That would make a bigint key reachable with a plain field list. No key closure in the API (rule 39) | 6 variants at 3 sites, and KeyRelease's 4 |
| F3 | A host guards on or cancels its fragment's operation | The fixture: rule 50 | Edge `IfJob`, pay-full's `Start`, Let's `Forget` |
| F4 | A fixture drives the runtime's head insertion (`followUps`) directly | The fixture, for the API; kept as `labFollowUps` | Ring, Notes, Kept, serial Bare |
| F5 | Entity and stream machines have no front end of the design's API here | Neither yet: steps 3 and 4 | 342 cases, on D209's block |
| F6 | An exit behind a guard had no thin-path form | The thin path: `exit` added to an alternative | AddressStep |
| F7 | A memory Schema stricter than what a case writes refuses at capture before the runtime's own repair runs | Neither: REV4-H4 pins the list repair, so `attachments` is `Unknown` | REV4-H4 |
| F8 | A commit that starts its request when its Effect runs (a service call) sends at another moment than one that starts when the commit is called (the hand fixtures' `api.call`). Under a seeded shuffle, two actors' requests leave in the other order | Neither: both are real clients. DRV keeps the eager form (its pins are about it); PAY-12/shuffle's output moved, logged | PAY-12/shuffle (output only) |
| F9 | `startThrows` reached only a bare commit, so DRV-02's fault never fired on a typed machine | The harness: fixed in `drive.ts` | DRV-02 |
| F10 | `Effect.provide` around each commit is a step a seeded scheduler sees | The prototype's `provide`: D211 | DRV-01 |
| F11 | Memory as an open record (round 10's `small(...)`: `Set` writes any key; Odd/All's whole-memory initial) | The fixture: memory is fields | V, M, S, R, N, M/x, Odd/All |

Found and fixed in the front end: a bare state token compiled as a history target; the same for an object's target (review H3); guard paths among closures (review M1); `places` on `machine` broke event inference (review H1).

## `Compiled` changes, collected

Made once, together, at the end of the port (D207, D211); the rest stated as owed.

| Change | Made? | Where |
| --- | --- | --- |
| Every closure a Slot (`commit`, domain, stream) | Yes, D207 | `gate.ts` `checkSlots`, `asSlot` refuses; `conformance/legacy.ts` for hand data |
| Slot paths unique per definition | Yes, D207 | `SealDuplicatePath`; the front end names by place (D206, review M1) |
| Services given to the Runtime | Yes, D211 | `harness.ts`, `drive.ts`, `adapter.ts`, `driver.ts` |
| `commit`'s type `Slot` only | No | `fixtures/compiled.ts` keeps the union: typed modules import refs and servers from hand modules, which the types gate then checks. The seal is the contract |
| `key` closure gone for `keyFields` | No, owed | Typed output makes the Slot from the list (`compileOp`); replacing the Slot at the seal would unhook the suite's per-Slot wrap. F2's hand cases need the closure until they are retired (Arpit's call) |
| `memory` as fields with Schemas, as data | No, owed | Typed output's three Slots carry the Schemas in closures; `flow check`'s rule 12 would read fields. For the compile prototypes |
| `events` required | No | Optional: hand data lacks it; `flow check` infers and says so |
| `domain` and `streams` closures as Slots | Yes, D207, D209 | typed blocks and `legacy.ts` |
| `idleMs` absent for unbounded | No, D210 | owed with the stream contract |
| `followUps` out of `Compiled` | No | The runtime's pending resets use the same field; the seam (D203) is the only author |

## The mid-session review's findings (`round-11/review-mid.md`), and what was done

| Finding | Done |
| --- | --- |
| H1 types gate | Fixed: `P` from its own property; selectors' event defaults to a record of `unknown`; `fixture()` generic. `types-check` passes: tsc clean over every typed fixture, 8 directives |
| H2 lock | `typed/` and `legacy.ts` walked into the lock; a falsify tamper (`lock: a one-token change to a typed fixture is red`) |
| H3 history target | Fixed and pinned (`checks/front-check.ts`) |
| M1 guard paths | By place; pinned; `SealDuplicatePath` at the seal |
| M2 codec numbers | Restated (D194 below, and RESULTS): data and module forms are additive by construction here; the choice rests on no drift and the compile's cost, and the hoisting compiler is rejected for its cost, not as impossible. Remeasured |
| M3 `CompiledData` | Run on every typed machine by `checks/front-check.ts` (71), with a structure check (dangling targets and defaults, unplaced fragments, keyFields), and three corruptions it must see. The claim that `flow check` and `explain` read `toData` is dropped: they read the evaluated definition with every Slot poisoned |
| M4 F2 | Relabelled (F2 above), the design question recorded |
| M5 API bends | `round-11/api-changes.md`; `unknown` by reason and optional keys in the design's spelling; the host's fragment op a named seam |
| M6 mutants | Pinned in `checks/front-check.ts`; a revert of the H3 fix and a dropped `disarmOn` each turn it red [ran] |

D194, restated after review M2: in-process is the choice because it is the only form where the object the suite boots is the object production boots, and because the compile's cost is small (Pay 0.035 ms warm, 50 machines 1.7 ms; cold 2.6 ms against the hand fixture's 1.6). The data and module forms, as built, both start from the evaluated definition, since a Slot is a closure over the author's module; so their being slower is by construction here, not by measurement of a fair rival. A fair rival is a source-transform compiler that hoists every closure into a module with real imports (prior art: Qwik's optimizer); it is rejected for its cost in complexity and capture rules, not as impossible.
