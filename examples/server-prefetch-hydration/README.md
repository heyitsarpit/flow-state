# Server prefetch and hydration

This example translates TanStack Query's `nextjs-app-prefetching` application into the narrow
Flow State server boundary. `app/page.tsx` maps to `createPokemonRequestBoot`, which creates one
request runtime, resolves and seeds a keyed resource, dehydrates boot v1, and disposes. The client
provider maps to `HydratedPokemonClient`, whose runtime owner is created after commit, hydrated
before the provider subtree appears, and disposed once on unmount.

The tests prove concurrent request isolation, atomic invalid-input rejection, repeatable hydration,
the prefetched first provider render, and owner cleanup. The repository's packed React 18 and React
19 fixtures compile the public boot hydration and provider contract, and the package build compares
this app's live behavior contract against `basic-cached-posts` twice in both human and JSON formats,
then checks the CLI's typed invalid-input failure.
