# Start order and constant starts: what an app author notices (T105, 2026-11-20)

**Bottom line:** a memory field starts at a constant only, so a default that depends on another field is derived
where it is read; creating an actor can no longer fail. Actors handled together go in a stated order, and a few
quiet failures now refuse loudly.

```ts
// BEFORE: handle computed from email at creation and stored
handle: Flow.initial(Schema.String, (fields) => String(fields["email"]).split("@")[0] ?? ""),

// AFTER: a constant start; the default is a view
handle: Flow.initial(Schema.String, ""),            // Flow.initial's shape is { schema, value }
export const chosen = (memory: Memory) =>           // user-defined, read where needed
  memory.edited || memory.handle !== "" ? memory.handle : (memory.email.split("@")[0] ?? "");
```

A function passed to `Flow.initial` fails to compile, and construction refuses it at `["memory", field]`.

## Behaviour to know

- **Start order (Actors R28, proposed):** a provider's dependents, a wave's consumers, graces and disposal go oldest
  first. Disposal takes the oldest ready identity next, consumers still ending before their providers; the same
  actors end either way, only the order of their messages and turns is now fixed.
- **Creation is total:** with computed starts gone nothing can refuse a fresh start, so that branch is gone. Every
  refusal (not ready, disposed, quarantined, a conflicting ref, a context cycle) happens before the start.
- **Now refused:** `scope` or `persistence` given alone ("persistence is missing", "scope is missing"); a non-object
  returned by `updateMemory`; Flow's own run-rule names used as property names.
- **Fixed:** a denied ending's lane change now publishes, so lane rows don't go stale (Pending D2); a restored
  schedule no longer arms in a state that isn't active.
- **Testing:** `unsettledWrites()` takes no type argument; Story runs, samples, generated steps, `publishedOf`,
  `pairSweep` and `propertyTest` are typed by your app.

## For your yes

- Merge @plan.Pending.D2, D3 and D4 into the Plans; each is now pinned by a fixture Story.

## Status

Unread.
