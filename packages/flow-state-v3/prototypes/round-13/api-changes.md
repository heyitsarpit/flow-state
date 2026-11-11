# Round 13: the story prototype and three commands against the public API

Status: **proposed**, for Arpit's read. Every place where `round-13/story/`, `round-13/cli/` and this round's `Compiled` changes differ from `machine-design.md` (2.10, 2.10.14, 2.2) as written, with before, after and a reason. Kinds as in `round-12/api-changes.md`: **Design** (adopted as written), **API change** (kept, for Arpit to accept or refuse), **Deviation** (not built; what stands in), **Seam** (below the API).

## Stories (2.10)

| Thing | Kind | Before (the design) | After (this prototype) | Why |
| --- | --- | --- | --- | --- |
| Constructors | **Design** | `Story.machine(m, opts)`, `Story.fragment(f, opts)`, `Story.app(setup, opts)` | `Story.machine`, `Story.fragment`. `Story.app` not built (**Deviation**) | The harness has one page and no `RuntimeSetup`; tabs, `ensure(ref)` and `openTab` wait for it |
| A machine Story's subject | **API change** | the machine (`CheckoutMachine`) | the suite's `Fixture` for it (`payFixture`): the typed machine plus its client half | The Runtime needs the machine's services at boot (D213); the design gets them from `fixtures` Layers, which this harness has no slot for. The fixture's `services` is that Layer |
| `E.Pay({ … })` | **API change** | the definition's event constructors | `story.E.Pay({ … })`, made from `Compiled.events` (round 13, M3): only outside events (a machine's `events`; a fragment's `events` and `hostEvents`), each checked at once against its payload Schemas by their type side (`StoryInvalidEvent`) | The compile prototype's `E.X` is a token, not a constructor. Typing these needs `Typed<R>` to carry its events (owed). An internal or mapped event is absent, so rule 47's "a type error" is a run-time absence here |
| `send(…events)` | **Design** | each event its own step | the same | |
| `world(…controls)`, the `world` option | **Design** | wire words and server controls | the same; `options.world` applied before the subject starts (2.10.1's start) | |
| `fixtures`, `world` fakes resolved per run from a registry | **API change** | `yield* Stripe` in a fixture Layer; the server registry is run-scoped | `options.fakes: [Shop]`: the servers a Story uses, given beside it; one fresh truth per run; a step naming a server it is not given is `StoryFakeError` | No Layer slot (above). `describe` prints exactly the plan's fakes |
| `advance(d)`, `advance({ next: { schedule } })` | **Design** | `d` a Duration; `next` by address | `"2 seconds"` or ms; `next` by schedule name only (`{ operation, timer }`, `{ actor }` not built) | the harness's timers name their schedule; operations' own sleeps are not addressable here |
| `advance(d, { suspended })`, `together`, `dispose`, `ensure()` | **Deviation** | 2.10.2 | not built | not needed by the 8 Stories; `together` needs the harness's `sendMany` and held admission |
| `reload()` on a machine Story | **API change** | `reload(name)` is an app Story's | a machine Story may `reload()`: the page dies and boots again with the same actor | 2.10.18.2's `reloadMidCharge` is an app Story only because `ShopSetup` persists the ref; the harness's machine identity persists by itself |
| `enter(input)`, `leave()`, `guards(answers)` | **Design** | 2.10.12 | the same; `leave({ end })`, `reset(subject)` and `enter(…, { subject })` not built | ThreeDS is a subroutine: no subject, no reset |
| The stand-in host | **Design** (2.10.12) | Flow builds it from the declaration alone | built through the compile API (`definition` + `machine`): a subroutine on a state `IN` beside `OUT`, a trait placed on `IN`; exits go to `OUT`, guard ports answer from `guards`, callbacks are filled with nothing | needs the fragment's ports as data, which `Compiled` now has (M3) |
| Reads re-rooted at the fragment | **Design** | `state`, `memory`: the fragment's own | the same; after an exit, `state` and `memory` throw `SubjectAbsent` and `read()` is `undefined` | |
| `checkpoint(name)` | **Design** | names the latest step cut; `end` reserved; duplicates refused | the same, refused at construction (type errors in the design) | |
| `run()` | **API change** | `await story.run()`, a Promise | `story.run()`, synchronous | the harness settles synchronously (the suite's drive); the design's microtask drain (rule 61) is the production executor's job |
| Rule 61's finish (release held, close, fire to a horizon, `HostTimeWait`) | **Deviation** | 2.10.2 | not built: a held request at the end stays held | this harness has no host work that could still be parked; nothing to report |
| `StoryRun` | **Design** in part | `frames`, `steps`, `checkpoints`, `end`, `evidence`, `payloads`, `trace` | `checkpoints`, `end`, `evidence`, `issues`, `requests`, and `cuts` | `cuts` is internal in the design; exposed for `flow trace`. No `frames` (the harness's frames are root views) |
| Checkpoint reads | **Design** in part | `state`, `memory`, `operations`, `schedules`, `read()`, `read(ref)`, `read(server)`, `read(endpoint)`, `lane`, `records`, `attempt`, `now`, `inspection`, `entity` | `state`, `memory`, `operations`, `read()`, `read(server)`, `read(endpoint)`, `lane(op, key?)`, `records(kind, filter)`, `attempt(op, { n })`, `now`, `seq`, `issues` | `schedules`, `inspection`, `entity` wait for the harness's Inspection and the entity round |
| `lane(op)` with no key | **API change** | Inspection's lane listing, by identity | the non-idle lanes among the keys the run could have made (each request's input, each sent payload, the memory, picked by the op's key fields); with no key and two lanes, `AmbiguousRead` | the harness's `Reads` has no lane listing. A lane under a key no source names would read as gone; stated |
| `records(kind)` | **Design** in part | 21 kinds | the runtime's own evidence kinds (`ending`, `mint`, `lane`, `turn`, …) and `verdict` (one per send: `Allowed`, `Denied { reasons }`, `Unhandled`) | `ending` records carry `op`, `channel`, `reason`, `attempt`; not yet `actor`, `route`, `subject` |
| `attempt(op)` with two mints | **Design** | `AmbiguousRead` | the same | |

## Fakes (2.10.4)

| Thing | Kind | Before | After | Why |
| --- | --- | --- | --- | --- |
| `Fake.server(name, { truth, initial, endpoints, controls })` | **Design** | | the same; reserved names and a name used twice refused (`StoryFakeError`) | |
| A handler's result | **Design** | `{ truth?, response, send? }`, pure | `{ truth?, response }`; `send` (stream frames) not built | no stream Story this round |
| `response` | **API change** | under `Fake.fetch`: `{ status, body?, headers? }`; else the client half's | `{ ok: value }` or `{ fail: { _tag, … } }` | the binding is the suite's `Api`: `ok` resolves the app's call, `fail` fails it with that tagged error. The commit's own classification runs on it (rule 62); `Busy` reaches WAITING through Pay's mapping, not an injection |
| A handler's headers | **API change** | the route context (`params`, `query`, `body`, `headers`) | `handle(truth, request, { idempotencyKey })` | the one header the fixtures send; the fake's dedupe by key (brief C16) needs it |
| `route` on `Fake.call` | **API change** | the binding (`Fake.fetch`'s route table, or a client half Layer) maps the app's transport to an endpoint | `Fake.call({ route: "pay", … })`: the transport's own name for the endpoint (the fixture's `shopFrom` calls `pay`, `place`, …); default the endpoint's name | the client half is fixed by the fixture, not the Story |
| `hold()`, `release()` | **Design** | the wire, W18 | `hold()` holds every request to the endpoint until `release()`, which answers them in order; a later request of a held route waits behind it (FIFO, as the fake world answers) | `hold({ times })` and `release({ nth, match })` not built |
| `drop({ at, times })` | **Design** | | `at: "request"` (never reached the server) or `"response"` (the handler ran, its answer lost) | |
| `duplicate`, `Fake.stream`, `Fake.storage`, `Fake.fetch`, `Fake.webSocket` | **Deviation** | | not built | storage always lands here: the harness acknowledges every write between steps |
| A request's phases | **Design** in part | `held`, `answered`, `dropped`, `orphan`, … | `held`, `answered`, `dropped`, `orphan` (released after a reload), `aborted` (new: the client gave it up before any answer) | |

## `flow story`, `flow trace`, `flow graph` (2.10.14, `round-7/cli-outputs.md`)

| Command | Kind | Design | Built | Why |
| --- | --- | --- | --- | --- |
| `flow story list` | **Design** | every Story, from the configuration | from `story/index.ts` (no `flow.config.ts`; CommandLine O6 not built); duplicate ids refused at load | |
| `flow story describe <id>` | **Design** | from the plan alone: subject, kind, options, every step in its data form, checkpoints, every fake the plan names with endpoints, controls and their Schemas | the same, with each Schema as JSON Schema; `callbacks run: 0` is counted, every handler and control wrapped before the command reads | |
| `flow story run <id>` | **Design** | what ran, no pass or fail; exit 2 on a rejection | the same: checkpoints with state and `seq`, endings, requests per endpoint and phase, issues | |
| `flow trace <id>` | **API change** (from the paper design) | paper: `flow trace summarize` over a trace file, `trace diff` over two; `explain --trace --at` for a point | `flow trace <id>`: the Story is run once and its timeline printed from the runtime's evidence (each turn's alternative paths by instance, endings, mints, lane cells) and the executor's step log (each step in its data form, the wire's phase changes, checkpoints with `seq`). `--at <checkpoint>` stops the timeline there | there is no trace file format yet (Inspection O4's export); the Story is the input that makes one. `summarize` is the default, `diff` and `--actor` filters are not built. `explain --trace --at` (values in place of `opaque`) stays the paper design's |
| `flow graph <machine>` | **Design** (2.10.14: "`flow check` and `flow graph` read its steps") | nodes and edges from `Compiled` | one edge per alternative, named by its own place; each says what decides it (`token:`, `idle:op(k)`, `port:`, `closure:<path>`) and is marked `late`, `shadowed`, `unreached` or `unsourced` when the data says it can never be taken; fillings, schedule triggers and `whenAbandoned` callbacks are edges; `unseen` lists what the data cannot say (follow-up closures, D209's module blocks, hand data's undeclared events) | conformance proof (HANDOFF 3b) needs one name shared by an edge and an observation |

## `Compiled` (round 12 review M3, M2; D221)

| Thing | Kind | Before | After | Why |
| --- | --- | --- | --- | --- |
| A fragment's declarations | **Design** (2.2.1) | `CompiledFragment`: nodes, memory, `whenAbandoned` | plus `kind`, `events: { external, host, internal, payloads }`, `ports: { exits, callbacks, guards }` (`optional` never set: `Flow.optional` is not built) | review M3: `flow graph`, `Story.fragment` and `flow check` need them as data |
| Event payloads | **Design** (2.2.1) | `Compiled.events`: names | plus `payloads`: event → field → Schema | the admission door's data, and a Story's checked sends |
| A field's default | **API change** (D222) | creation took the decoding default; restore the decoding default, then a constant initial | one default per field (its Schema's constructor or decoding default, or `Flow.initial`'s constant) at both doors; two different ones, or a default beside `Flow.initial`, refused (`TwoDefaults`) | mid review M2; coordinator's call, for Arpit |
| A key field | **API change** (D221, **Arpit's call**) | rule 39: "no default", unchecked; round 12's `KeyOf` required every field, the first round 13 one let an optional one be absent | required, with no default: `KeyFieldOptional` at the compile; `KeyOf` a required pick | an absent value is never a key value |
| A release that changes `keyFields` | **API change** (D221) | D78: the lane is renamed to the new key; D217 and the first D221: an older lane matched by shape or projection | a new version of the op: old lanes are old-version holds, reached by their own old keys; every commit of the op declines beside one | three failed designs; see `../convergence-13.md` |
| A lane's key fields | **Runtime** (not public) | none | `Lane.keyFields`, stamped at mint, saved, never changed | D221 |
| `turn` evidence | **Runtime** (not public) | actor, event, root `from`/`to` | plus each part's `definition`, `at`, `node`, `tag`, `target`, `fused`, and the moved incarnation's `path`, `from`, `to` | `flow trace` and the graph gate name the alternative that ran |
