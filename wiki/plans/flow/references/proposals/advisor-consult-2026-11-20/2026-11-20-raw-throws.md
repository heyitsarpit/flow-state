---
proposal raw-throws
status accepted user 2026-11-20 [@review.advisor-holes]
    proposed 2026-11-20
---
# One answer for raw throws (2026-11-20; revised after review and hole-poking)

Every recommendation was accepted: T98 first, `Symbol.for`, testing route in T98.

**Bottom line (proposed):** every function Flow itself makes and hands out, on any route, is made by one
constructor that takes a Schema of its arguments, decodes them once through Effect's Exit (the Result and Sync
adapters throw), and passes `run` only the decoded value; a refusal or anything thrown becomes a FlowError on that
one path, with the code its argument's Schema names. A construction first copies the plain objects and arrays it
was given, so each property is read once and a cycle is refused. Every value Flow makes carries one brand, `Made`,
and is recognised in one place: a `Schema.declare` leaf. A type test over each route's type finds any function
that is not a gated one. The freedom removed: **Flow code that reaches a caller, or reads a caller's value, without
going through the decode** (opt-in wrapping, check-and-discard decodes, marks probed at many sites).

Answers question 7 of @questions.advisor-questions. Unblocks @task.V3.T98. Shares `decodeExit` and the boot
rule with @proposal.saved-records and the `Made` brand with @proposal.body-types.

## The class and its freedom

Three instances so far (T81's failure limit, T94's sweep, T94's review), each fixed one entry at a time. Four
freedoms feed it, all found in the code today:

1. **Wrapping is opt-in per site.** `entry`/`builder` (code:packages/flow-state-v3/src/entry.ts) are called at
   about 50 sites; nothing makes a new function go through one. Bare today: tokens' `make` (`src/handles.ts`), a
   bound contract's `textOfKey` and `call` (`src/contract.ts`), `attachInspector`'s `dispose`, and every export of
   the testing route (`src/host/testing/index.ts`: `defineConfig`, `Story` chain, `generate`, `Fake`, ...).
2. **Decode is a check; its result is thrown away.** `findingsAgainst` (code:packages/flow-state-v3/src/config.ts)
   returns findings only; `definition` then reads `config.id`, `config.events`, and runs `config.operations` from
   the raw argument, and `compile-body.ts` reads `target`, `guard`, `actions` raw. A getter or Proxy is read twice,
   and what compile sees was never decoded.
3. **Flow-made values are recognised at many sites.** `~flow`, `~owner`, `~path` are probed in `config.ts`,
   `compile-body.ts`, `construction.ts` and `definition.ts`, each site its own check, and tokens carry callables
   (`make`, `~walk`) on their public type. The class is reading fields no decode checked, not forgery.
4. **Effect's sync adapters throw.** Verified by spike: `Schema.decodeUnknownResult` throws on a throwing getter
   and on a cyclic input (stack overflow); only `decodeUnknownExit` returns both (as a Die). No cycle guard exists.

T94's surface walk catches (1) only for values a test happens to reach; nothing catches (2) to (4) by structure.

## Where the data comes from

A caller's JavaScript value (an object literal, a Proxy, a class instance, a value copied from another definition)
reaches a public function. That function's first and only read of it is the gate's copy and decode. Inside, Flow
passes only decoded Types and `Made` values; it never reads a caller's object again.

## The structure

1. **One gate, three kinds** (existing `entry`, `entryEffect`, `builder`, given an argument Schema). The gate
   decodes with `decodeExit` (the shared helper, `Result<Type, Refused | Threw>`), `onExcessProperty: "error"`,
   `errors: "all"`. `Refused` becomes findings at their paths under the code annotated on the argument's Schema
   (`InvalidConfiguration` by default; `send`'s payload names `InvalidEvent`, a provider ref `ForeignActorRef`), so
   @spec.Diagnostics' codes stay. `Threw`, and anything `run` throws, is one `Defect` with its cause. `run`'s
   parameter is `Args["Type"]`: the raw argument is not in scope.
2. **Builders capture, constructions decode.** A `builder` keeps T81's rule (captures unread) and returns a `Made`
   value; the construction that receives it decodes what it captured, so the error keeps its path in the
   definition. So a value is decoded once, at the boundary that uses it: an event payload by `send` (its compiled
   walker, as now), never also by `E.X(...)`.
3. **The plain copy.** Construction kinds only (`definition`, `machine`, contracts, `runtimeSetup`, `defineConfig`)
   copy before decoding: an array, or an object whose prototype is `Object.prototype` or `null`, is copied with
   each own enumerable property read once; a cycle among them is `InvalidConfiguration` (`Cyclic`). Every other
   object (a `Duration`, a Schema, an `Option`, a `Schedule`, a `Made` value, a function) is a leaf kept by
   identity for the Schema to judge. The copy lives in the gate, not in `decodeExit`. Hot entries (`send`,
   `getSnapshot`) take no copy.
4. **One brand, one recognition.** Tokens, bound contracts, captured builder results and rule tokens are `Made`:
   their internals (`make`, `textOfKey`, `~walk`, `call`, the owning definition) sit under one key that is off the
   public types, and only `madeBy(kind, owner)` (NEW, a `Schema.declare` leaf) reads it; the `no-mark-probe` lint
   bans every other probe. `Definition` and `Machine` stay plain readonly data (`Rent.E.Pay()`, `D["S"]` and every
   tool reading `compiled` need their fields); only their leaves are `Made`. Type-only phantoms (`~app`,
   `~services`, `~names`, `~provider`) stay. How the key is made is question 1.
5. **Routes are typed tables.** Each route exports one object made by `route({...})` (NEW), constrained by
   `Bare<T> extends never`: every function Flow made that is reachable in its type is a `Gate`. Exempt by name:
   the `FlowError` and `Diagnostic` classes, constants such as `Flow.entry`, and user callbacks Flow passes through
   (`commit`, `lookup`, guards), which are the user's functions, not Flow's. Returned Runtime and Actor methods and
   `attachInspector`'s `dispose` are gated one by one and listed in the route's type. T94's run-time walk stays as
   the second guard.

The gate's shape (all names but `Args`, `run` and `Gate` are existing in `src/entry.ts`):

```ts
// existing: entry   NEW: Args (the argument Schema), Gate (the brand)   user-defined: nothing
export const entry: <Args extends Schema.Top, R>(
  name: string,
  Args: Args, // NEW: decoded once, through the Exit; each member may annotate its refusal code
  run: (...args: Args["Type"]) => R, // only decoded values in scope
) => Gate<(...args: Args["Encoded"]) => R>; // existing: FlowError on every failure path
```

Generic public functions (`definition` has seven `const` generics) keep their own signature: the gate's returned
type is cast to the declared signature once, as `registered` does today, and `Args` is the Schema of the erased
configuration. A Struct decode rebuilds plain objects and passes `Made` and Effect leaves through by identity.

**User code with no caller.** A gate covers a call. Code Flow runs at a boot or a wake (a Schema's decode, a
`resetOn`, a schedule's delay) follows saved-records' boot rule: a throw is a `Defect` issue naming the place and
the identity is not woken. It is the same `decodeExit`, mapped by the boot instead of the gate.

## How each part is shown, and its cost

| Part                    | Shown by                                                                           | Cost                |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| One gate                | Story: the hostile table (`tests/surface/`) on every reached function, both routes | ~50 sites           |
| `run` sees only decoded | Type test: `@ts-expect-error` on reading a raw field inside `run`                  | Args Schemas        |
| Codes kept              | The existing code tests (`InvalidEvent`, `ForeignActorRef`) unchanged              | One annotation each |
| Plain copy              | Story: cyclic `states`, a getter, a trapped Proxy; Room's `Duration` still builds  | One walk            |
| One recognition         | Lint `no-mark-probe`, no exemptions; type test: no public `make`, `~walk`          | Tokens redone       |
| Routes typed            | Type test: `Bare<typeof route>` is `never`; planted fault `gate-bypass`            | `route()` twice     |
| Exit-only decode        | Lint: `decodeUnknownResult`/`Sync`/`Option` banned outside `decodeExit`            | None at run time    |

Planted faults (for `nub run faults`): `gate-bypass` (a bare function on a route), `decode-discarded` (an entry
reading its raw argument), `mark-probed` (a token checked outside `madeBy`), plus T98's existing three. The
Exit-only lint lands with saved-records' change to `record-format.ts#decodeBy`, which uses the Result adapter today.

## Against the real entry points

| Entry point                                           | Today                                                             | Under the gate                       |
| ----------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| `definition`                                          | `entry`; check-only decode, then raw reads; runs `operations` raw | Copy, one decode, `run` on Type      |
| `machine` (and `compile-body.ts`)                     | `entry`; `~owner` by `hasProperty`; raw body reads                | `madeBy`; body decoded               |
| `transaction`, `resource`                             | `entry`; bound `call`, `textOfKey` bare                           | Bound contract `Made`; both internal |
| `E.X`, `S.X.is`, `O.x.*` (`handles.ts`)               | `entry`, `builder`; `make` bare; `~` marks                        | Gated; one brand                     |
| `Flow.*`, `deny`, `send`, `Outcome.*`                 | `builder`; `Flow.entry` a marked object                           | `builder` returning `Made`           |
| `turn(...)`, `.each`, `.resumable()` (not built)      | none                                                              | Born as gated builders (question 3)  |
| `app`, `runtimeSetup`, `actorRef` (`host/runtime.ts`) | `entry`; `app` returns raw config                                 | Decoded config kept                  |
| Runtime, Actor methods (`src/host/runtime.ts`)        | `entry`/`entryEffect`                                             | Same, with `Args`                    |
| Testing route (`host/testing/`)                       | bare (`defineConfig`, `Story`, `generate`, `Fake`)                | Gated (`entryEffect`)                |

## Prior art

- Effect Schema at the boundary: one `decodeUnknown*` per source; v4.1.4's Exit adapter is the only one that
  returns a Die instead of throwing. Effect has no cycle guard, so the plain copy is Flow's, kept to one walk.
- Effect recognises its own values by `Symbol.for` TypeIds so that two loaded copies agree (question 1 B).
- Effect RPC `Rpc.make({ payload })` and `HttpApiEndpoint`: a handler receives only the decoded payload. The gate
  is that shape for synchronous calls.

## Spikes

- `scratchpad/q7/throws.mjs` (run): `decodeUnknownResult` throws on a throwing getter and on a cyclic Suspend
  input; `decodeUnknownExit` returns a Failure for both.
- `scratchpad/q7/gated.ts` (types): a `Gate<F>` brand keeps a `const` generic's literal through the call, and a
  depth-capped `Bare<T>` names the one bare function's path. Not tried against the real `Definition` types.
- `scratchpad/holes/copy.ts` (run): a copy of own enumerable properties breaks `Duration.isDuration`,
  `Option.isOption` and `Schema.isSchema`, which is why the copy stops at non-plain objects.
- `scratchpad/holes/exitcost.ts` (run): `decodeUnknownExit` 0.78 µs against 0.86 for Result and Sync on a two-field
  Struct; the Exit-only rule costs nothing measurable.

## Open questions

1. **How a `Made` value is recognised at run time.** (user; API judgement) A: a module-private `WeakMap`: cannot be
   forged, but two loaded copies of Flow (a Vite SSR dedupe miss, a peer split) refuse each other's values. B: one
   `Symbol.for("flow-state/Made")` key on a shared prototype, as Effect does, with the per-definition owner compare
   kept (recommended: follows Effect, survives two copies of one version; a hand-built object carrying the symbol
   is unsupported, as in Effect). body-types' `Exact` stops at the same brand under either answer.
2. **Testing route scope.** (user; Task scope) A: gated in T98 (recommended; it is public). B: gated when the route
   is exported from `package.json`.
3. **Order with @task.V3.T106 and @task.V3.T109.** (user; Task order) A: T98 lands first, so `turn(...)`, `.each`
   and `.resumable()` are born gated and `Made` (recommended; body-types' question 2 adds `turn`). B: after, and
   they are rewritten.

## Uncovered

- Error attribution for store refusals (five names, two `reasonOf`) and closed `details.reason` values
  (@plan.Diagnostics.O1): owed by T98 but a separate design.
- User callback results at run time (cut by the user in T95) and user callbacks that never return.
- Whether `Bare<T>` stays cheap over the real `Definition`/`Machine` types: the first step of T98; if it does not,
  the run-time walk stays the only route guard.
- Effect-returning entries that throw inside the returned Effect: the gate covers the call, not the Effect's body.
- Two copies of Flow of different versions; and whether `decodeExit` passes lint-bomb's core rules.

## Revision log

Review = the Sonnet review; Hole and HQ = @review.advisor-holes §2 holes and questions. No sidecars were
started for the revision; each item was checked against `entry.ts`, `error.ts`, `record-format.ts` and the spikes.

- Review 1: fixed. `Definition` and `Machine` stay plain data; only leaves are `Made`.
- Review 2: fixed. Only run-time marks are banned; type-only phantoms stay.
- Review 3: fixed. The claim is "functions Flow makes"; classes, constants and user callbacks are exempt by name;
  `dispose` and Runtime and Actor methods are gated and listed.
- Review 4: fixed in the text (cast for `const` generics, leaves by identity); `Bare<T>` on real types is Uncovered.
- Review 5: fixed. The lint lands with saved-records; the copy is the gate's; order is question 3; one brand.
- Review 6: fixed (about 50).
- Hole 1, HQ1: fixed. The copy takes plain objects and arrays only; freedom 3 no longer claims forgery.
- Hole 2, HQ2: left to the user (question 1).
- Hole 3, HQ3: fixed. The refusal code is an annotation on the argument's Schema.
- Hole 4: fixed. `decodeExit` returns `Refused | Threw`; each boundary maps its own.
- Hole 5: fixed. A payload is decoded once, by `send`; `E.X(...)` captures.
- Seam 5 (boot-time user code): fixed by citing saved-records' boot rule.
- Body-types hole 3 (`turn` born bare): fixed in the entry table; order is question 3.
- Earlier questions 1 to 3 (copy, builders, shared helper): folded into the design as internal choices.
