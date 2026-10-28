# System B: locked-island split

Two fragment kinds. Fragments are locked islands of logic: **they never own or wait on I/O.** The
machine runs every operation and owns every I/O rule (Operations plan, unchanged). Starting code:
[collapsed-sketch.md](../collapsed-sketch.md), minus I/O-shaped fragments and `start`.

## Kinds

| | `trait(contract, body)` | `subroutine(contract, body)` |
| --- | --- | --- |
| The actor… | has it | goes into it |
| States of its own | none | yes; they appear under its state (`CODE.LOCKED_OUT`) |
| Placed in the definition | `traits: { name: T }` at the root, or `T.at("PATH")` on a node | as a state: `states: [{ NAME: S }]`, in a machine or in another subroutine |
| Lives | while its node is active (root: the actor's life); fresh on every activation | while its state is active; fresh on every entry |
| Ends | when its node is left | by taking an exit, or abandoned when its host leaves the state |
| Contains | traits | traits and subroutines |

## Contract (both kinds)

- `input`: a Schema record, filled by the host per placement, read once when the fragment
  activates. The host's filler reads memory **after** the entering transition's updates and the
  entering event (or exit payload, or callback payload).
- `events`: sent by the UI **or** raised by the host, at the instance path (`E.code.Changed`).
- `internalEvents`: produced only by the fragment's own `schedules`. Nobody else sends them.
- `memory`, `initial`, `schedules`, `on` (and `states`, `default` in subroutines).
- `guards: ["canEdit"]`: named places the host may refuse; used as `guard: guards.canEdit`.
- `callbacks: { onChanged: { value } }`: called with `notify: [callbacks.onChanged.from(f)]` on a
  transition, never in `actions`.
- `exits: { Done: { … } }` (subroutines only): taken as a target, `exits.Done.from(f)`.
- Forbidden in fragments: `operations`, `activities`, `context`, `onContext`, `send`, operation
  actions, outcome mappings into the fragment.

## Host side (machine)

- One filling block per instance. Traits: `traits: { name: { input, guards, callbacks } }` at the
  machine root, wherever the trait is placed. Subroutines: on their state,
  `{ input, guards, callbacks, exits }`. A subroutine fills the fragments it contains the same way.
- Every declared port must be filled; `{}` ignores a callback.
- Callback and exit fillings are ordinary `on`-style handlers (`target?`, `updateMemory?`,
  `actions?`, `raise?`), may be ordered alternatives, and must end in an unguarded one. Their data
  is `payload`.
- **A callback never leaves its placement node; an exit must.** So a root trait's callback may move
  the host anywhere; a subroutine's callbacks never move it.
- `raise: [E.child.Event.from(f)]` sends a child's public event in the same turn.
- The host feeds facts to a fragment (a server answer, a rollback) by raising one of its `events`.

## One turn

A transition plus the callbacks it notifies, the exits it takes and the events it raises is one
transition. All guards read the pre-turn snapshot. If any part refuses, the whole transition
refuses, and `check()` agrees. At most one part changes state; parts write disjoint memory keys.

## Testing

`story.machine(fragment, { id })` wraps a fragment in a harness that fills every port, records
callback calls and exits (`run.calls`, `checkpoint.exit`), and may send the fragment's events.
`.enter(input)` enters a subroutine; `.leave()` leaves it.
