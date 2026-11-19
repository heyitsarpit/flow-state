# Context slots and reactions (accepted, 2026-11-20)

**Bottom line:** a context slot is declared whole on the definition with `Flow.context`, reading its one provider
through typed tokens; a machine reacts with `C.slot.change({ when?, event })`. No strings name a slot or a field,
one slot has exactly one provider (a type error, then a construction error), and the compiled graph holds
field-level edges from a provider's field to a consumer's event, so static analysis can follow them.

**Accepted by the user (2026-11-20):** the whole proposal except the items under Open; built by @task.V3.T107.

**Why now:** a reaction's `select` and a slot's `Provider.select(Schema, fn)` are opaque functions. Slot names are
string keys, `when`'s arguments are untyped (`never`), and the graph only knows "the consumer depends on all of the
provider". T104 found this while typing context; the user asked for a shape designed with static analysis in mind.

**Read first:** code:packages/flow-state-v3/src/machine.ts#Reaction,
code:packages/flow-state-v3/src/core/compiled.ts#ContextSlot, code:packages/flow-state-v3/src/host/wiring.ts,
code:packages/flow-state-v3/fixtures/session/machines/agenda.ts.

## Before

```ts
export const Badge = definition({
  id: "Shop/Badge",
  states: ["SHOWN"],
  events: {},
  internalEvents: { Bumped: {} },
  memory: { bumps: Flow.initial(Schema.Number, 0) },
  context: { count: Cart.Provider.select(Schema.Number, (s) => s.memory.items.length) },
})

export const BadgeMachine = machine(Badge, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [
    {
      select: ({ context }) => context.count,                  // the slot re-selected by its string key
      when: (current, previous) => current > previous,         // current, previous: never (unchecked)
      event: E.Bumped,
    },
  ],
  on: { Bumped: { updateMemory: ({ memory }) => ({ bumps: memory.bumps + 1 }) } },
}))
```

## After

```ts
export const Badge = definition({
  id: "Shop/Badge",
  states: ["SHOWN"],
  events: {},
  internalEvents: { Bumped: {} },
  memory: { bumps: Flow.initial(Schema.Number, 0) },
  context: {
    items: Flow.context(Cart.M.items),                         // NEW: pass-through; Schema and provider from the token
    count: Flow.context(Schema.Number, {                       // NEW: derived; declares its own Schema
      reads: { lines: Cart.M.items, coupon: Cart.M.coupon },   // NEW: M tokens; all from one provider
      select: ({ lines, coupon }) => (coupon === "" ? lines.length : lines.length + 1),   // lines: string[]
    }),
  },
})

export const BadgeMachine = machine(Badge, ({ S, E, C }) => ({ // NEW (accepted): C, one token per slot
  default: S.SHOWN,
  onContext: [
    C.count.change({                                           // NEW (accepted): .change
      when: (current, previous) => current > previous,         // current, previous: number
      event: E.Bumped,                                         // existing: or E.Bumped.from((count) => ({ count }))
    }),
  ],
  on: { Bumped: { updateMemory: ({ memory }) => ({ bumps: memory.bumps + 1 }) } },
}))
```

A slot that reads the provider's state uses existing state tokens:

```ts
session: Flow.context(AuthSession.S.SIGNED_IN),   // NEW use of an S token: boolean, "is it in this state"
payment: Flow.context(Pay.state),                 // NEW: X.state, the current state's name as a typed union
```

**Added:** `Flow.context(token)` and `Flow.context(Schema, { reads, select })`; `M` tokens (one per public memory
field); `S` tokens and `X.state` as reads; `C` tokens with `.change`.

**Dropped:** `Provider.select(Schema, fn)`; a reaction's own `select`; untyped `when` arguments.

**Unchanged:** the machine's `on` handlers, wiring a slot to a provider ref
(`Badge.ref("header", { context: { count: cartRef } })`), and the admission check.

## Rules

1. **Two forms.** Pass-through: `Flow.context(token)`; the slot's Schema is the field's and its provider is the
   token's definition. Derived: `Flow.context(Schema, { reads, select })`; `reads` is always a named object,
   `select` receives the read values by those names and must return the Schema's type.
2. **One provider per slot.** A slot binds to one provider instance, so every token in `reads` comes from one
   definition. Banned twice: a type error (the tokens' provider brands form a union) and a construction error
   (`InvalidConfiguration` at `["context", slot, "reads", key]`) for casts and plain JavaScript. Values from two
   machines need two slots. A planted fault drops the construction check.
3. **What a read may name.** A provider's public memory fields (`Cart.M.items`), a state token (boolean), or
   `X.state`. `Flow.private` fields have no `M` token, so reading one fails to compile.
4. **Recompute only on a read change.** A turn that changes none of a slot's reads skips the slot: no select, no
   comparison.
5. **`.change` turns a value change into an event, nothing more.** It has `when(current, previous, { memory })` and
   `event`. Guards, targets, memory updates and actions stay in that event's ordinary `on` handler, so every input
   (external events, schedules, reactions) enters the machine as a named event that traces, cuts and the graph show.
   With no `when`, every change enqueues the event. The `{ memory }` argument covers the one fixture that mixes a
   slot with memory (`inbox.ts`).
6. **Selection stays on the definition, not in the machine or the reaction.** Slots and reactions are not
   one-to-one: five fixtures have slots no reaction watches (read by guards or snapshots), and `inbox.ts` has 12
   slots and 14 reactions. One derivation per slot serves every reader.

## What static analysis gains

- Field-level edges from the definition alone: `Cart.items` → `Badge.count`; with the machine, → `Badge.Bumped`.
  `explain`, `graph` and @task.V3.T106's structural rules (`reachable`) can follow a chain across machines.
- Construction errors: a reaction whose event no state handles; a mixed-provider slot; a `.change` on a slot the
  definition does not declare (already a type error through `C`).
- Observed writes (which fields a transition actually wrote) come from Story runs, not declarations; with the
  declared edges they give the whole chain `Cart.Add` → `items` → `Badge.Bumped`. A reaction no Story fired is
  reported unseen (@task.V3.T106).

## Evidence

A standalone type probe (2026-11-20) compiles under `--strict` with two `@ts-expect-error` lines that must fail: a
`reads` mixing two providers, and a `select` returning the wrong type. The real code needs a definition's `id` kept
as its literal (`src/definition.ts` types it `string` today) through a `const` type parameter; T104's definition
brand on tokens (F3) provides it. Branding by the definition's object type is unsafe: two same-shaped definitions
merge.

## Open

- **`onContext` inside a state node** (proposed earlier, not yet answered): a reaction live only in the states that
  handle its event, so no change is dropped silently; top level stays and means every state.
- **The name `.change`** is accepted; `.from` stays an event-payload word only.
- **Cost:** about 30 `Provider.select` sites and every `onContext` site change; `M` is a new token family.
- **Prior art:** reselect's explicit input selectors (static dependencies, versus Recoil and Jotai tracking them at
  run time); XState's state-scoped `on` and `invoke`.
