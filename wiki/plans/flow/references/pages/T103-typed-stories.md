---
page T103-typed-stories
---
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

## Status

Read and closed by the user, 2026-11-20. The five testing words (D35 to D39: @plan.Testing.O3, @plan.Testing.O4) are merged into
@plan.Testing. Of the known gaps, typed `snapshot.operations` and `getSnapshot()` landed in @task.V3.T104's snapshot
carrier; a stopped Runtime's read returning `{}` as memory is still owed there.
