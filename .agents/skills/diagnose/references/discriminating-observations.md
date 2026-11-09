# Discriminating observations

Techniques for choosing an observation that separates competing causes.

## Census for an imbalance

Use when work, load, latency, or failures are unevenly spread and fixes have not helped.

- **Count it per actor** across comparable runs. The census shows which actors hold the
  imbalance, not merely its total size. Make the census rerunnable
  (`principle-make-work-rerunnable`).
- **Read the skew.** If the same few actors hold most of the imbalance on every run, inspect what
  assigns them that role. Confirm the assignment mechanism before calling it the cause.
- **Remove the asymmetry instead of compensating for it** when the role assignment is confirmed
  as the cause. Rotating, randomizing, or moving the role may address it. A shared pool, batched
  hand-off, or periodic rebalance may leave the assignment intact and add work on every run.
  Preserve required ordering, fairness, and ownership; a proposed alternative still needs proof.
- **An even census does not support the persistent-skew hypothesis.** Look elsewhere, and keep
  the census as evidence; it does not prove every other assumption correct.

## Failures after restart

Inspect persistent state first: configuration, caches, lock files, and serialized values.
If resetting an **isolated copy** restores behavior, prioritize state validation as a hypothesis.
Never reset the user's own state, and do not treat a reset alone as proof of the cause.

## Other failure shapes

For any other shape, list the plausible causes, predict what each would make you observe, and pick
the cheapest observation whose predicted results differ.
