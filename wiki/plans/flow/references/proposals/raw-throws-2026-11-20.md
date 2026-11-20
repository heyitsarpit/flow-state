# One answer for raw throws (proposed, 2026-11-20)

**Bottom line (proposed):** every function Flow hands out, on any route, is made by one constructor that takes a
Schema of its arguments, decodes them once through Effect's Exit (never the Result or Sync adapters, which throw),
and passes `run` only the decoded value; a refusal or anything thrown becomes a FlowError on that one path. Every
value Flow makes is opaque: no `~` fields and no callables of its own; its parts live in a module-private `WeakMap`,
and a Schema recognises it by membership. A type test over each route's type finds any function that is not a gated
one. The freedom it removes: **Flow code that reaches a caller, or reads a caller's value, without going through the
decode** (opt-in wrapping, check-and-discard decodes, shape-marked tokens, callables inside data).

Answers question 7 of `advisor-questions-2026-11-20.md`. Unblocks @task.V3.T98. Fits beside
`saved-records-2026-11-20.md`: the same rule (downstream takes only what one Schema decoded), applied to calls
instead of records; both should share one decode helper (see Q3).

## The class and its freedom

Three instances so far (T81's failure limit, T94's sweep, T94's review), each fixed one entry at a time. Four
freedoms feed it, all found in the code today:

1. **Wrapping is opt-in per site.** `entry`/`builder` (code:packages/flow-state-v3/src/entry.ts) are called at 53
   sites; nothing makes a new function go through one. Bare today: tokens' `make` (`src/handles.ts`, `member`), a
   bound contract's `textOfKey` and `call` (`src/contract.ts`), `attachInspector`'s `dispose`, and every export of
   the testing route (`src/host/testing/index.ts`: `defineConfig`, `Story` chain, `generate`, `Fake`, ...).
2. **Decode is a check; its result is thrown away.** `findingsAgainst` (code:packages/flow-state-v3/src/config.ts)
   returns findings only; `definition` then reads `config.id`, `config.events`, and runs `config.operations` from
   the raw argument (`src/definition.ts`, after `refuse`), and `compile-body.ts` reads `target`, `guard`, `actions`
   raw. A getter or Proxy is read twice, and what compile sees was never decoded.
3. **Flow-made values are recognised by shape.** `~flow`, `~owner`, `~path` reads in `config.ts`, `compile-body.ts`,
   `construction.ts`, `definition.ts`; a copied mark passes, and the token carries callables (`make`, `~walk`).
4. **Effect's sync adapters throw.** Verified by spike: `Schema.decodeUnknownResult` throws
   `Error("Result adapter can only return schema issues")` on a throwing getter and on a cyclic input (stack
   overflow); only `decodeUnknownExit` returns both (as a Die). Schema has no cycle guard.

T94's surface walk catches (1) only for values a test happens to reach; nothing catches (2) to (4) by structure.

## Where the data comes from

A caller's JavaScript value (an object literal, a Proxy, a class instance, a value copied from another definition)
reaches a public function. That function's first and only read of it is the gate's decode. Inside, Flow passes only
decoded Types and opaque handles; it never reads a caller's object again.

## The structure

1. **One gate, three kinds** (existing `entry`, `entryEffect`, `builder`, given an argument Schema). `entry(name,
   Args, run)`: `Args` is a Schema of the argument tuple. The gate decodes with `decodeUnknownExit`, `onExcessProperty:
   "error"`, `errors: "all"`; an Issue becomes `InvalidConfiguration` findings at their paths, a Die becomes one
   `Defect` carrying what was thrown, a success calls `run(decoded)`, and anything `run` throws is a `Defect`.
   `run`'s parameter is `Args["Type"]`, so the raw argument is not in scope to read. A `builder` keeps T81's rule
   (captures unread) and returns an opaque `Captured` handle; the construction decodes what it captured.
2. **Construction gates before the plain read.** For construction kinds only (`definition`, `machine`, contracts,
   `runtimeSetup`, `defineConfig`) the gate first takes a plain copy: each own enumerable property read once,
   Flow-made handles kept by identity, a cycle refused as `InvalidConfiguration` (`Cyclic`). Then one Schema decodes
   the copy whole. Hot entries (`send`, `getSnapshot`) skip the copy and decode through their compiled walker, as now.
3. **Opaque values.** Tokens, definitions, machines, bound contracts and captured builder results are instances of
   one `Made` shape: no enumerable fields, internals in a `WeakMap<Made, Parts>` beside them (the pattern T94 already
   uses for drivers and handles). A token's Schema is `Schema.declare((x) => this definition's set.has(x))`, so
   ownership is part of the decode and the `~owner` compare disappears. Callable tokens (`E.X`, `S.X.is`,
   `O.x.retryable`) are gated functions. `make`, `textOfKey`, `~walk` and `call` move into `Parts`, off the
   public types.
4. **Routes are typed tables.** Each route exports one object made by `route({...})` (NEW), whose constraint is
   `Bare<T> extends never`: every function reachable in its type is a `Gate`. T94's run-time walk stays as the second
   guard and now enters opaque values through `Parts`, on both routes.

The gate's shape (all names but `Args`, `run` and `Gate` are existing in `src/entry.ts`):

```ts
// existing: entry   NEW: Args (the argument Schema), Gate (the brand)   user-defined: nothing
export const entry: <Args extends Schema.Top, R>(
  name: string,
  Args: Args, // NEW: decoded once, through the Exit
  run: (...args: Args["Type"]) => R, // only decoded values in scope
) => Gate<(...args: Args["Encoded"]) => R>; // existing: FlowError on every failure path
```

Generic public functions (`definition<const C>`) keep their own signature: the gate's returned type is cast to the
declared signature once, as `registered` does today, and `Args` is the Schema of the erased configuration.

## How each part is shown, and its cost

| Part | Shown by | Cost |
| --- | --- | --- |
| One gate | Story: the hostile table (`tests/surface/`) on every reached function, both routes | ~53 sites rewritten |
| `run` sees only decoded | Type test: `@ts-expect-error` on reading a raw field inside `run` | Args Schemas per entry |
| Plain copy | Story: cyclic `states`, a getter, a trapped Proxy (inverted today) | One walk per construction |
| Opaque values | Type test: no `make`, `textOfKey`, `~` on public types; lint | `config.ts` tokens redone |
| Routes typed | Type test: `Bare<typeof route>` is `never`; planted fault `gate-bypass` | `route()` on two routes |
| Exit-only decode | Lint: `decodeUnknownResult`/`Sync`/`Option` banned in `src/` outside the gate | None at run time |

Planted faults (for `nub run faults`): `gate-bypass` (a bare function on a route), `decode-discarded` (an entry
reading its raw argument), `mark-forged` (a token checked by shape), plus T98's existing three.

## Against the real entry points

| Entry point | Today | Under the gate |
| --- | --- | --- |
| `definition` | `entry`; check-only decode, then raw reads; runs `operations` raw | Copy, one decode, `run` on Type |
| `machine` (and `compile-body.ts`) | `entry`; `~owner` by `hasProperty`; raw body reads | Membership; body decoded |
| `transaction`, `resource` | `entry`; bound `call`, `textOfKey` bare | Bound contract opaque; both in `Parts` |
| `E.X`, `S.X.is`, `O.x.*` (`handles.ts`) | `entry`, `builder`; `make` bare; `~` marks | Gated; marks gone |
| `Flow.*`, `deny`, `send`, `Outcome.*` | `builder`; `Flow.entry` a marked object | `builder` returning `Captured` |
| `app`, `runtimeSetup`, `actorRef` (`host/runtime.ts`) | `entry`; `app` returns raw config | Decoded config kept |
| Runtime, Actor methods (`src/host/runtime.ts`) | `entry`/`entryEffect` | Same, with `Args` |
| Testing route (`host/testing/`) | bare (`defineConfig`, `Story`, `generate`, `Fake`) | Gated (`entryEffect`) |

## Prior art

- Effect Schema at the boundary: one `decodeUnknown*` per source; v4.1.4's Exit adapter is the only one that returns
  a Die instead of throwing (spike below). Effect has no cycle guard, so the plain copy is Flow's, kept to one walk.
- Effect RPC `Rpc.make({ payload })` and `HttpApiEndpoint`: a handler receives only the decoded payload
  (`effect/unstable/rpc` RpcServer decodes with `decodeUnknownEffect` before calling the handler). The gate is that
  shape for synchronous calls.
- `Schema.declare` for identity: a Schema whose guard is `WeakSet` membership, as `boundaries.md` already plans.

## Spikes

- Run-time, `scratchpad/q7/throws.mjs`: `decodeUnknownResult` throws on a throwing getter and on a cyclic Suspend
  input; `decodeUnknownExit` returns a Failure for both. Proves part 2 and the Exit-only lint are needed.
- Type, `scratchpad/q7/gated.ts`: a `Gate<F>` brand keeps a `const` generic's literal through the call, and a
  depth-capped `Bare<T>` names the one bare function's path (`.leaky.token.make`) and is `never` for a clean table.
  Not tried against the real `Definition` types (depth and cost unknown).

## Sidecar log

- Inventory (Haiku): the bare list in freedom 1, check-only decode at `config.ts#findingsAgainst` with raw reads in
  `definition.ts` and `compile-body.ts`, `~` reads list. Accepted after reading the cited lines.
- Effect prior art (Haiku): Result/Sync adapters throw on a Die (`internal/schema/cause.js#getSchemaIssueOrThrow`),
  no cycle guard, Rpc/HttpApi decode-then-handle. Accepted; the throw verified by the run-time spike. Its unread
  claim that RpcServer passes the decoded payload to the handler is not verified, and not load-bearing.

## Open questions

1. **Plain copy before decode.** A: every construction kind copies first (recommended: cycles, getters read twice,
   Proxies, one rule). B: no copy; cycles and getters end as one `Defect`, and the inverted cyclic test changes
   its expectation.
2. **Builders.** A: keep T81's capture-unread, opaque `Captured` handle decoded by the construction (recommended:
   errors keep their path in the definition). B: builders decode at once, so `Flow.initial(5, ...)` refuses at its
   own call; simpler, but loses the path and makes every builder an entry.
3. **Shared decode helper with saved records.** A: one core `decodeAt(schema)` returning `Result<Type, Findings>`
   via Exit, used by the gate and by `recordSchemas` (recommended). B: each keeps its own.
4. **Testing route scope.** A: gated in T98 (recommended; it is public). B: gated when the route is exported from
   `package.json`.
5. **Order with @task.V3.T109 and T106.** A: T98 lands before new public functions (fragments, rules) are added, so
   they are born gated (recommended). B: after, and they are rewritten.

## Uncovered

- Error attribution for store refusals (five names, two `reasonOf`) and closed `details.reason` values
  (@plan.Diagnostics.O1): owed by T98 but a separate design.
- User callback results at run time (cut by the user in T95) and user callbacks that never return.
- Whether `Bare<T>` stays cheap over the real `Definition`/`Machine` types; needs a spike at T98's start.
- Effect-returning entries that throw inside the returned Effect: the gate covers the call, not the Effect's body.

## Review findings (Sonnet review, 2026-11-20)

Findings for the next lead to resolve; ✓ marks one the coordinator checked in the code. Nothing here is decided.

1. ✓ Wrong: definitions and machines cannot be opaque with no enumerable fields (lines 54-55): `Rent.E.Pay()`,
   `D["S"]`, `machine()` reading `definition.E/S/O` and every tool reading `compiled` need them. Make only token
   leaves and run-time marks opaque; keep Definition and Machine as plain readonly data.
2. The `~` ban is too broad: public types carry type-only phantoms (`~app`, `~services`, `~names`, `~provider`).
   Ban only marks present at run time (`~flow`, `~owner`, `~path`, `~walk`).
3. Escapes the gate: `attachInspector`'s returned `dispose`; exported `FlowError` and `Diagnostic` classes (exempt
   them in `Bare<route>`); user callbacks (`commit`, `lookup`, guards) are passed through, so "every function Flow
   hands out" over-claims; returned Runtime and Actor methods need a per-method list; `Flow.entry` is a constant.
4. `entry(name, Args, run)` does not fit `definition`'s seven `const` generics; decoding a Struct rebuilds objects,
   so Flow handles must be `Schema.declare` leaves; run `Bare<T>` on the real types before choosing `route()`.
5. Siblings: `record-format.ts` decodes with `decodeUnknownResult` today, so the Exit-only lint must land with
   saved-records' migration; the plain copy belongs in the gate, not in the shared `decodeAt`; T98 before T109
   becomes a dependency once fragments add `.each` and `.resumable()`. body-types' `Exact` stops at tokens by
   their `~flow` mark, so `Made` must be one shared brand in both proposals.
6. About 50 gated call sites, not 53.
