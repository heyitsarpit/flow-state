# Plan 02 [Research and architecture decision]

## Purpose

Research internals and ecosystem choices only after the first example has created concrete API pressure.

## Scope

- XState internals.
- Cache and invalidation semantics.
- React subscription strategy.
- Fine-grained reactivity options.
- Testing and type-testing strategy.

## Procedure

1. Read targeted XState internals.
2. Write short notes on transition resolution, actors, invocation, cancellation, guards, and actions.
3. Compare the findings against the Project Editor API needs.
4. Research cache key, tag, stale, refresh, invalidation, optimistic update, and rollback semantics.
5. Decide whether a signal engine is worth testing internally.
6. Decide whether v1 wraps XState, interoperates with XState, or implements a minimal machine core.
7. Produce an architecture memo.

## Acceptance Criteria

- Each research note answers a concrete question from the example.
- The architecture memo lists decisions, tradeoffs, and deferred work.
- The next implementation slice is unambiguous.

## Out Of Scope

- Broad rewrite of plans based on vibes.
- Premature devtools work.
- Wholesale copy of XState internals.

## Open Questions

Empty until Project Editor creates concrete pressure.
