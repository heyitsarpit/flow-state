# System C: single stateless fragment

One kind, `fragment(contract, body)`. Fragments are locked islands of logic: **they never own or
wait on I/O**, and they **have no states of their own**: modes are kept in memory. The machine runs
every operation (Operations plan, unchanged).

## Placement and lifetime

- Placed in the definition's `fragments: { name: F }`: bare at the root (lives for the actor's
  life), or `F.at("PATH")` on a host node (fresh every time that node is entered, removed when it
  is left).
- A "step" is a plain host state with a fragment attached to it with `.at`.
- Fragments may contain fragments (`fragments` in their own contract), at their root only (they have
  no nodes).

## Contract

- `input`: a Schema record, filled by the host per placement, read once when the fragment
  activates. The host's filler reads memory **after** the entering transition's updates and the
  entering event.
- `events`: sent by the UI **or** raised by the host, at the instance path (`E.code.Changed`).
- `internalEvents`: produced only by the fragment's own `schedules`.
- `memory`, `initial`, `schedules`, `on`. No `states`, no `default`, no `exits`.
- `guards: ["canEdit"]`: named places the host may refuse; used as `guard: guards.canEdit`.
- `callbacks: { onDone: { … } }`: called with `notify: [callbacks.onDone.from(f)]`, never in
  `actions`.
- Forbidden: `operations`, `activities`, `context`, `onContext`, `send`, operation actions,
  outcome mappings into the fragment.

## Host side (machine)

- One filling block per instance: `fragments: { name: { input, guards, callbacks } }` at the machine
  root, wherever the fragment is placed. A fragment fills the fragments it contains the same way.
- Every declared port must be filled; `{}` ignores a callback.
- Callback fillings are ordinary `on`-style handlers (`target?`, `updateMemory?`, `actions?`,
  `raise?`), may be ordered alternatives, and must end in an unguarded one. Their data is `payload`.
- **Callbacks may move the host anywhere.** The fragment only reports; the host decides, including
  leaving the node the fragment is attached to (which removes the fragment).
- `raise: [E.child.Event.from(f)]` sends a child's public event in the same turn.
- The host feeds facts to a fragment by raising one of its `events`.

## One turn

A transition plus the callbacks it notifies and the events it raises is one transition. All guards
read the pre-turn snapshot. If any part refuses, the whole transition refuses, and `check()` agrees.
At most one part changes state; parts write disjoint memory keys.

## Testing

`story.machine(fragment, { id })` wraps a fragment in a harness that fills every port, records
callback calls (`run.calls`), and may send the fragment's events.
