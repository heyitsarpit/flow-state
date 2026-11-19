# Typed Story assertions: what an app author notices (T103, 2026-11-19)

**Bottom line:** in Stories, what you read back is typed by your own definitions, so a misspelt field, state or event
is a compile error instead of a test that quietly reads `undefined` or matches nothing.

```ts
const cut = run.checkpoints.added
cut.read(mainCart)?.memory.lines                     // typed from Cart's memory; "lnes" fails to compile
cut.read(mainCart)?.state === "OPEN"                  // typed from Cart's states; "OPNE" fails to compile

turnsOf(run, Cart.E.Add)                              // NEW: turns of exactly Cart's Add, by token
evidenceOf(run, ...)                                  // NEW: evidence selected by token, not by name string
publishedOf(run, mainCart)                            // NEW: published snapshots, typed the same way

export const Carts = Fake.server("Carts", { ... }, { lost: () => new NoResponse() })
// NEW, required: a lost answer fails with your port's own error; no catchTag("FakeLost", ...) in your fakes
```

A token selects only its own machine's events, so two machines that both declare `Unsure` don't mix. Filtering evidence
by a name string is now a lint error (`flow-state/no-event-name-filter`).

## For your read

The five new testing words are recorded as proposed: Pending D35 to D39 (typed `read`, `publishedOf`, `turnsOf`,
`evidenceOf`, `lost`).

## Known gaps

`snapshot.operations` and a runtime handle's `getSnapshot()` are still untyped, and a stopped Runtime's read can still
return `{}` as memory; these go to the type-gaps Task being scoped now.
