# Bounded infinite feed

This example translates TanStack Query's `infinite-query-with-max-pages` fixture into a Flow
State application. `src/pages/index.tsx` maps to the explicit `feedMachine` window owner,
`projectPageResource` keyed pages, and `feedView` bounded projection. `src/pages/api/projects.ts`
maps to the typed `ProjectFeedService` and deterministic fixture layer.

The visible window contains at most three pages, while older keyed page data may remain in the
runtime resource store. Tests use controlled Effect gates to prove refresh, retry, and stale
completion behavior without network or wall-clock timing.
