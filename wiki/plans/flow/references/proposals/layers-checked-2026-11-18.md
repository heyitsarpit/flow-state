# Layers and Checked: trust carried by types (2026-11-18, proposed)

**Bottom line:** untrusted input enters a codebase only through **layers**. A layer's output is a **`Checked`**
type that only that layer can produce, so every other function, in any module, at any depth, proves it received
checked data just by its parameter types. The intended nesting of layers is stated up front in **composition
proofs**: type-level files that compile only if the code makes them true. This is a small, general package
(working name `checked`), not Flow-specific. Flow is its first user.

Everything here is **proposed**. Prior art, superseded by this file:
code:wiki/plans/flow/references/proposals/boundaries-2026-11-18.md (doors, nominal tokens), and the layer-manifest
spike on branch `worktree-agent-a215f85639e31d688`. A 10-minute spike of this design passed (section 8).

## 1. The problem

@task.V3.T20 and @task.V3.T81 each hit the Epic's failure limit on one class of bug: Flow relied on input it never
checked, or checked it in the wrong place. The review findings fall into four kinds:

- **Skipped check:** code relies on a value no check produced (a private helper given raw config; a binding read
  raw from a record). Fixed by `Checked` parameter types (section 2).
- **Raw throw:** bad input escapes as a TypeError (`retryable(undefined)`, null payloads, cyclic config). Fixed by
  the layer's catch-all (section 2).
- **Forged or copied value** trusted by a mark (`machine({ "~owner": … })`, `{ ...Counter }`). Fixed by `X.is` on
  object layers (section 2).
- **Incomplete check:** the check ran but missed a field (NaN delay as 0 ms; lane keys; key versus content). Out of
  scope: the check's own decode (T92, T81's Schema).

The checks were applied module by module, so every review found the next gap. The fix is to compose at the level
of **layers**, nested like concentric rings, which is what `policy-code-composition` teaches inside one module.

## 2. The package API

```ts
import { Layer, type Checked, type Raw, LayerError } from "checked"     // NEW package

// A layer: a name and its enter function, the only way in.
export const Definition = Layer("Definition", (config: Raw<"config">) => decodeDefinition(config))
export const Machine = Layer("Machine", (definition: Checked<typeof Definition>, body: Raw<"body">) =>
  compile(definition, body))

// Using it.
const definition = Definition(rawConfig)          // → Checked<typeof Definition>, or throws LayerError
Machine.is(value)                                 // object layers only: true for values this layer made
```

- **`Layer(name, enter, options?)`** returns the enter function itself, wrapped. Calling it:
  - runs `enter`;
  - stamps the result with `Checked<typeof X>`, which only `Layer` can produce (the key is unexported);
  - turns anything `enter` throws into `LayerError { layer, cause }`, except errors `options.passes` accepts (a
    project's own error type, such as Flow's `FlowError`, passes through unchanged);
  - for object outputs, remembers the result in a `WeakSet`.
- **`Checked<typeof X>`** is the trusted type. It is also spelled `typeof X.Checked`, in Effect's style.
- **`X.is(value)`** exists only on layers whose output is an object. It refuses copies, spreads and forgeries,
  because they are not in the layer's `WeakSet`. Primitive outputs have no `is`: the type is the protection.
- **`options.remember: false`** for hot paths: the stamp is type-only and costs nothing; no `is`.
- **`Layer.generic(name, (stamp) => enter)`** for an `enter` with type parameters (for example `const`
  generics): `enter` stamps its own result, so its generics survive. TypeScript cannot keep them through a wrapper
  that re-types the result, so this second form is required.
- **`Raw<Source>`** is an opaque type for untrusted input: it has no readable fields, so raw data can't be used
  until a layer has checked it. The source is named: `Raw<"storage">`, `Raw<"network">`, `Raw<"config">`.
  Typed public entries (such as `definition({...})`, which needs literal inference) keep their user-facing type;
  `Raw` fits world input best.

## 3. The composition: rings, written up front

The intended composition is one file, shaped like the diagram: concentric rings, with rings side by side where
they really are. It is a prescription people and agents read first, and a proof: it compiles only if the code
makes it true. Every link in it is an imported value; the only strings are a ring's name and its reason.

```ts
// composition.ts
import { compose, ring } from "checked"
import { App, Definition, Event, Machine, Restored } from "./src/layers.ts"     // layers (values)
import { Body, Caller, Config, Storage } from "./src/sources.ts"              // sources: Source("storage"), …
import * as Core from "./src/core/turn.ts"                                    // a module (value)

export default compose(
  ring("App", "what users declare; checked once, when the app is built",
    Definition.accepts(Config),
    Machine.accepts(Definition, Body),
    App.accepts(Machine),

    ring("Runtime", "what callers send while the app runs",
      Event.accepts(Machine, Caller),
      ring("Core", "the pure turn: trusts everything it is given", Core),
    ),

    ring("World", "data from outside the process",
      Restored.accepts(Storage),
    ),
  ),
)
```

**The vocabulary:**

| Word | Meaning |
| --- | --- |
| `ring(name, why, ...)` | a level; holds `accepts` lines, modules and inner rings; several inner rings are siblings |
| `X.accepts(A, B, ...)` | layer `X` is entered with exactly these: checked values of layers, and raw sources |
| a module (`Core`) | ordinary code living at this level |
| `across(X)` | an explicit exception inside `accepts`, for a sideways or outward link (not spiked yet) |
| `compose(...)` | the whole composition |

**What the proof checks:**

1. **Each line is exact.** `Machine.accepts(Definition, Body)` compiles only if `Machine`'s real enter parameters
   carry exactly a checked Definition and a raw Body. Plain values (`times: number`) are allowed; `unknown` counts
   as unchecked. A mismatch fails on that line.
2. **Rings.** Everything in a ring may use layers of its own ring or an enclosing ring, never a sibling or an
   inner ring, unless marked `across(...)`.
3. **Modules.** Every function a module exports takes only checked values its ring can see. This covers future
   exports too, and catches `peek(raw: unknown)` (the T20 pattern).
4. **Every layer appears.** Each `Layer(...)` registers itself; one test fails on a layer with no `accepts` line.
   This is the only rule checked by a test rather than by types.

**Two forms, kept in sync.** The package has a type-only core, `Prove<[RingT<"App", [Row<typeof Machine, [typeof
Definition, typeof Body]>, …]>]>`, which holds the semantics. The public `ring`/`accepts`/`compose` functions are
typed so they reduce to exactly that core, so correctness lives in one place.

**Splitting.** An area can keep its own composition and the top level includes it, so inner areas own the claims
about themselves.

## 4. Trust deep inside: pass the checked parent, or brand the field

A `Checked` parameter is the signal that data came from a checked source. It is lost when a function receives a
field instead of the parent (`render(states: ReadonlyArray<string>)`). The rule:

1. **Pass the checked value, not its fields,** by default.
2. **Give meaningful fields their own layer.** Identifiers, keys, references, units and money get a layer whose
   output is a primitive: `const ActorName = Layer("ActorName", decodeActorName)`, and functions take
   `Checked<typeof ActorName>`. This is the general "branded identifier" pattern (Rust newtypes, Effect
   `Schema.brand`, Zod `.brand()`), expressed with the same `Layer`.
3. Plain fields that carry no identity (counts, display text) stay plain.

## 5. Enforcement

| Property | How |
| --- | --- |
| Data enters only through a layer, at any depth | **types**: `Checked` and `Raw` parameters |
| The intended nesting holds | **composition proofs** (section 3) |
| No one fakes a `Checked` value | by construction (unexported stamp key), plus a **lint rule** banning casts to it |
| Imports point inward | a **folder-structure lint rule** (Flow's existing Scope import rules) |
| A layer never lets a raw throw escape | the catch-all, by construction |
| A copied or forged object is refused | `X.is` on object layers |

Not enforced, by design: whether a layer's check is complete. The trusted type is the concept; the check's own
decoding (a Schema) is the layer author's job.

## 6. In Flow

- **Layers (first cut):** `Definition`, `Machine`, `App`, `Ref`, `Event` (hot), `Callback` (hot), `Restored`,
  `Answer` (hot). The real list comes from the boundary map, section 1 of
  code:wiki/plans/flow/references/proposals/boundaries-2026-11-18.md.
- **Identifier layers:** `ActorName`, `RecordKey`, `LaneKey`, `AttemptId`, `StateName`. Today these travel as plain
  `string` (`decodeName(compiled, name: string)`, `inputOfName(compiled, name: string)` in `src/core/identity.ts`),
  which is where T20's findings broke. T92 introduces them.
- **Errors:** Flow passes `FlowError` through each layer (`options.passes`) and maps `LayerError` to a FlowError
  Defect in one place.
- **Tokens:** `~flow` and `~owner` marks are replaced by `X.is` on the definition and machine layers.
- **Where it lives:** a small package in the workspace that `packages/flow-state-v3` depends on, so other projects
  can use it.

## 7. Prior art and what was dropped

- **Dropped:** the manifest of layers with per-layer fields (it grew with fields and restated the code); the
  `door`/`gate` names; `FlowError<Code, Door>` (TypeScript has no typed throws); a registry-driven fuzzer.
- **Kept from the earlier designs:** one way in per layer, the catch-all, `WeakSet` identity for objects, and
  "builders capture" as a guideline for builders that should not read their arguments early.
- **Prior art:** Rust newtypes and typestate; Haskell `newtype`; "parse, don't validate"; Effect `Schema.brand`
  and `Brand`; Zod `.brand()`.

## 8. Spike results (scratch, not in the repo)

**Layers** (10 minutes): a raw throw becomes `LayerError`; a project error passes through; `is` refuses a spread
copy; hot layers remember nothing; `Layer.generic` keeps literal types (plain `Layer` does not, for a generic
`enter`). Cost per call: plain 0.5 ns, hot layer about 5 ns, cold layer about 8 ns: about 0.2 % of `send`'s 3.6 µs.

**Rings** (about 2 minutes of building): the public form and the type-only form compile together on correct code
(`tsc` 0.05 s). One deliberate break of each rule:

| Break | Result |
| --- | --- |
| `Machine.accepts(Definition)`, forgetting `Body` | fails on that line: stated `Definition`, actual adds `raw:body` |
| a World layer accepting Runtime's `Event` | fails: `"Answer reaches outside its ring"; reaches: "Event"` |
| `peek(raw: unknown)` added to the core module | fails: `"peek takes a value its ring cannot see"` |
| a `Layer("Forgotten", …)` with no line | the registry test reports `no line for Forgotten` |

**Found, to fix before it is public:**

- The messages are right but noisy: TypeScript prefixes them with the whole ring type. Failures should be string
  literals, so the error reads as one sentence.
- Only `accepts` errors land on their own line; ring and module errors land at `compose(`. The same parameter
  trick inside `ring(...)` would move them to the ring.
- Not yet spiked: `across(...)`, cycles, `Layer.generic` inside `accepts`, and type-check cost at Flow's scale.

## 9. Open questions

1. **Package name:** `checked` (recommended), or another.
2. **Generic variant name:** `Layer.generic` (recommended), `Layer.stamping`, or another.
3. **Error message type name:** the internal stamp should print as `Checked<"Definition", …>` so proof errors read
   cleanly (recommended: yes).
4. **First adoption:** rebuild T81 on it and let T92 introduce the identifier layers (recommended), or a spike on
   two real modules first to measure `Accepts` at scale.
5. **Skill:** fold this into the `policy-module-composition` skill as its mechanism (recommended).
6. **Names:** `ring` for a level and `Layer` for a way in stay as they are for now (the user, 2026-11-18); `entry`
   and `holds` (one word for both) were considered and not taken.
