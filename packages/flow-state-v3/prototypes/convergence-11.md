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

## `Compiled` changes, collected

Filled in during the port, then made in one change.
