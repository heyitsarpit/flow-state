# Optimistic transactions

This application references
`docs/codebases/tanstack-query/examples/react/optimistic-updates-cache/src/pages/index.tsx` and
`src/pages/api/data.ts`. The Flow State transaction owns preview, commit, rollback, invalidation,
and refetch; `features/todos/resources.ts` owns the canonical editable entity, and the screen
machine owns feedback plus its dismissal timer.

The upstream example appends random list items. This rebuild edits one deterministic entity so
overlapping preview layers and exact rollback are visible without a second application cache.
Run `pnpm --filter @flow-state/optimistic-transactions dev` or
`pnpm --filter @flow-state/optimistic-transactions test`.
