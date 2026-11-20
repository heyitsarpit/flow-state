# Round 12: the compile prototypes against the public API

Status: **proposed**, for Arpit's read. The compile prototypes are `conformance/compile/` (`operations.ts`, `fragment.ts`, `machine.ts`, over `memory.ts`, `events.ts`, `body.ts`); they replace round 11's fixture front end (`conformance/typed/flow.ts`, deleted, prior art in git at `bc934edb`). Every typed fixture in `conformance/typed/` is written in their spelling, and the suite boots their output and nothing else (RESULTS). This file lists every place where they differ from `machine-design.md` as written, with before and after. Each row is one of:

- **Design**: the design's spelling, adopted this round. The "before" is round 11's fixture front end.
- **Retired**: a round 11 bend (`round-11/api-changes.md`) that is gone.
- **API change**: the compile prototypes' own spelling, kept, with the reason. These change the public API and are for Arpit to accept or refuse.
- **Deviation**: the design's feature is not built here; what stands in, and why.
- **Seam**: not public API; a fixture drives the runtime below the API, counted apart.

## Round 11's bends, one by one

| Round 11 row | Now | Before | After |
| --- | --- | --- | --- |
| Placement in the body | **Retired** (Design, 2.3) | `traits: { x: { fragment: F, ...fill } }`, `into: { fragment, ...fill }` in the machine body, and `places` on the definition for raises | placement in the definition: root `traits: { x: F }`, a node's `Flow.state(children, { traits })`, a subroutine `{ NAME: Sub }`; the body fills at the node (`traits.x`, `states.NAME`). `places` is gone: `E.<instance>` comes from the placement |
| An exit behind a guard (F6) | **Retired** (Design, 2.2) | `{ guard, exit: exits.Done.from(f).exit }` | `{ guard, target: exits.Done.from(f) }`; a bare `exits.Done` stays the shorthand |
| A selector's event as `unknown` | **Retired** (Design, 2.7.3) | every handle's selector read `{ [k]: unknown }` | a member written in a handler is typed by that handler's event (return-type inference on `Act<Ev>`). Pinned in `type-tests.ts`: a select that reads `event.text` under `Saved` is a type error. Limit: a member written as a shared `const` outside any handler still reads `unknown` fields, and must annotate |
| `resource({ commit })` | **Retired** (Design) | `commit:` on a resource | `lookup:` |
| `unknown:` targets unchecked | **Retired** (Design, rule 13) | any event | the event must be `Flow.uncertain(fields)`; the operations compiler refuses another (`UnknownNotUncertain`). Pinned in `front-check.ts`. Type-level refusal not built (a runtime brand only) |
| `unknown` by reason, optional keys, history targets, guard paths | **Design**, unchanged | | |
| A subroutine's `into.name` | **Seam** | `into: { fragment, name: "wizard" }` | `{ RESOLVING: Flow.state(Wizard, { name: "wizard" }) }`. The hand Desk/Ticket's cases address `["wizard"]`; the design names it by its state. Retire with that fixture |
| `index` on an alternative | **Seam**, unchanged | | parity with the pinned hand Pay's Slot paths under `--swap`. Retire with the pinned Pay |
| `labFollowUps`, `labHostOp` | **Seam**, unchanged | | Ring, Notes, Kept, serial Bare (F4); Edge, pay-full, Let (F3) |
| `moduleMember`, `activities` by stream name, `domain`, `streams` | **Deviation**, unchanged (D208, D209) | | the sessions and entity modules' handles are the entity round's. 289 of the 696 typed-only cases boot such a block (RESULTS) |
| Services (D211) | **API change** (D213), below | | |

## Differences round 11 did not list

| Thing | Kind | Before | After | Why |
| --- | --- | --- | --- | --- |
| The state tree | **Design** (2.3) | a nested object, `states: { A: {}, B: { C: {} } }` | the ordered list, `states: ["A", { B: ["C"] }]`, with `Flow.state(children \| Sub \| nothing, { traits })` | The design's spelling; it is what lets a node carry placement |
| State bodies | **Design** (2.3's example) | flat by node id: `states: { A: ..., C: ... }` even for a child of B | nested as the states are: `states: { B: { states: { C: ... } } }`; a body for a state not under that parent is refused (`UnknownState`) | The design nests; the flat form let a body name a node at the wrong depth |
| `fragment(d, b)` | **Design** (2.1) | one constructor | `trait(d, b)` and `subroutine(d, b)`; children placed in the declaration's `traits` (2.3), `states` an ordered list | |
| `.each`, `.resumable()` | **Design** (2.1, rule 9) | filling fields `each: {...}`, `resumable: true` in the body | methods on the placed value in the definition: `Lockout(...).each({ of, max })`, `Countdown(...).resumable()` | Placement, not filling |
| Lane members with a key | **Design** (2.7.3) | `O.x.retry.key(k)`, `O.x.cancel.key(k)`, `O.x.retryable({ times, key })` | `O.x.retry(k)`, `O.x.cancel(k)`, `O.x.retryable(k, { times })`; key-less `O.x.retry`, `O.x.cancel`, `O.x.idle` unchanged | |
| A contract's services | **API change** (D213) | the commit's `R`, type-only | `services: [ShopApi]` beside `commit`; a list that misses one of `R` leaves the contract with no `outcomes` (a type error at its use); compiled to `Op.services` | Review H1, rule 57: the summary carries requirements and Inspection prints it, so they must exist as data; the seal can then refuse a boot that lacks one by name. The cost is a second statement of what `R` says, kept honest by the type check. Rejected: requirements from types alone (no runtime refusal by name); a string table (drifts) |
| A boot's services | **API change** (D213) | `Context<never>` by casts | `servicesFor(machine, context)`, typed by the machine's `R` (`NoInfer`), the one erasure | Review H1. Production's form would be a `Layer<R>` for a `ManagedRuntime`; the prototype's Runtime takes a context |
| A contract's `output` | **Deviation** | absent | optional and unread | OD12 makes `output` required; this prototype has no persisted resources or SSR, so nothing reads it. Required with those |
| A trait with exits | **Deviation** | allowed | allowed | Desk's LateFill places a trait with an exit, as the hand fixture does. The design keeps exits for subroutines; the compile does not refuse them on a trait yet |
| Guard inputs | **Deviation** | `{ memory, event, key?, item? }` | the same | 2.3's guards read `state` and `schedules` (`S.X.is(state)`, `schedules.x.done`). The runtime's `GuardIn` has neither; a token guard (`S.X`) covers position. A runtime change, not a compile one |
| `Flow.optional` ports; required ports a type error | **Deviation** | absent | absent | No fixture needs them, and the port-filling types are loose (a filling is optional). Owed with the summary type (rule 57) |
| `Flow.private` hidden outside | **Deviation** | the field is marked | the field is marked, and `Compiled.memory.fields` says so (D214) | Outside types do not omit it yet |
| A definition written inline as `machine(definition({...}), body)` | **Type limit** | worked | compiles, but `E` loses the placed instances' raise tokens: `machine`'s parameter types the definition's states contextually | Write the definition as its own `const`, as the design's files do (`signin.definition.ts`). Deep in `typed/real.ts` does |
| `Definition.guard(path?, g)`, `handler(path, h)` | **Deviation** | absent | absent | No fixture shares a guard across nodes |

## What the compiled output is

The compile prototypes emit `CompiledOutput` (`fixtures/compiled.ts`): `keyFields`, `inputFields` and `services` on every operation, memory `fields` with the three Slots, `events`. `typed/compare-all.ts` compares every typed fixture with its hand twin as data (73 pairs, 4 differences stated, 0 unexplained) and `typed/compare.ts` Pay, ThreeDS and Countdown (52, all stated), as round 11's front end did: the port changed spelling, not output.
