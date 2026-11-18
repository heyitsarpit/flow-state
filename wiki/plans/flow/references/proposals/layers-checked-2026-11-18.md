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

## 3. Composition proofs

The intended composition is written up front, as types. It compiles only if the code makes it true; there is no
manifest that restates the code.

```ts
// composition.proof.ts
import type { Accepts, Checked, Enters, Proof, Raw } from "checked"
import type { App, Definition, Event, Machine, Restored } from "./src/layers.ts"
import type * as Core from "./src/core/turn.ts"

export type Composition = Proof<[
  Enters<typeof Definition, [config: Raw<"config">]>,                            // the outermost layer
  Enters<typeof Machine, [definition: Checked<typeof Definition>, body: Raw<"body">]>,
  Enters<typeof App, [machines: ReadonlyArray<Checked<typeof Machine>>]>,
  Enters<typeof Restored, [record: Raw<"storage">]>,
  Accepts<typeof Core, Checked<typeof Machine> | Checked<typeof Event> | Checked<typeof Restored>>,
]>
export const proven: Composition = true
```

- **`Enters<L, Args>`**: layer `L` is entered with exactly `Args`. This states the nesting order.
- **`Accepts<M, Allowed>`**: every function module `M` exports takes only `Allowed` (and no `unknown`, `any` or
  `Raw`). It covers future exports too, with one line.
- **`Proof<[...]>`** is `true` when every statement holds; otherwise it is the first failure, as a readable type:

  ```text
  Type 'boolean' is not assignable to type '{ failed: "peek takes a value that is not checked";
    parameters: [raw: unknown]; }'.
  ```

- **Proofs compose.** An area can keep its own `*.proof.ts` beside its code, and the top-level proof includes it:
  `Proof<[CoreProof, HostProof, Enters<…>]>`. Each area owns the claims about itself.
- **Agents read the proof first** to learn the nesting before touching code.

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

## 8. Spike result (10 minutes, scratch, not in the repo)

- The proof compiles on correct code (`tsc` 0.05 s on the spike).
- Loosening `Machine` to take a raw object fails the proof, naming the stated and actual arguments.
- Adding `peek(raw: unknown)` to the core fails the proof, naming `peek`.
- `Layer.generic` keeps literal types; plain `Layer` does not, for a generic `enter`.
- Runtime: a raw throw becomes `LayerError`; a project error passes through; `is` refuses a spread copy; hot layers
  remember nothing.
- Cost per call: plain 0.5 ns, hot layer about 5 ns, cold layer about 8 ns; about 0.2 % of `send`'s 3.6 µs.
- Not measured: type-check time of `Accepts` over Flow's real modules.

## 9. Open questions

1. **Package name:** `checked` (recommended), or another.
2. **Generic variant name:** `Layer.generic` (recommended), `Layer.stamping`, or another.
3. **Error message type name:** the internal stamp should print as `Checked<"Definition", …>` so proof errors read
   cleanly (recommended: yes).
4. **First adoption:** rebuild T81 on it and let T92 introduce the identifier layers (recommended), or a spike on
   two real modules first to measure `Accepts` at scale.
5. **Skill:** fold this into the `policy-module-composition` skill as its mechanism (recommended).
