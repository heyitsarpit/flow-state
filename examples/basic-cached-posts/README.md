# Basic cached posts

This Flow State application rebuilds the behavior in
`docs/codebases/tanstack-query/examples/react/basic/src/index.tsx` without TanStack Query or
live HTTP. `features/posts/resources.ts` owns the list and keyed detail cache, the screen machine
owns navigation plus `ensure`/`refresh`, and `ui/PostsScreen.tsx` only sends events and reads the
actor, resources, and view.

The upstream persistent browser cache is intentionally omitted: this example teaches in-memory
runtime ownership, while the offline-recovery example owns persistence. Run it with
`pnpm --filter @flow-state/basic-cached-posts dev` and test it with
`pnpm --filter @flow-state/basic-cached-posts test`.
