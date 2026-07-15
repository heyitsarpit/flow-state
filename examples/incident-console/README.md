# Incident Console

This package is the prepared Phase 6 flagship workspace. It contains a minimal
Next.js client, Tailwind CSS v4, shadcn/ui initialized with the Base Nova style,
and a package-owned Playwright smoke test. No shadcn registry components are kept
until a real product interaction needs one. The Phase 6 implementer replaces the
scaffold probe with the real client/server incident console.

Read these contracts before implementation:

- [Phase 6 execution](../../tasks/PHASE_6.md)
- [Product and interactions](../../tasks/PHASE_6_APP.md)
- [Feature and scenario coverage](../../tasks/PHASE_6_COVERAGE.md)
- [Client structure](../../CLIENT_STRUCTURE_CONTRACT.md)

Install Chromium once, then run the package-owned browser gate:

```sh
pnpm browser:install
pnpm test:browser
```

Use `pnpm dev` to run the scaffold at the URL printed by Next.js, or
`pnpm test:browser:headed` to watch the smoke interaction. Root `pnpm dev`,
`pnpm browser:install`, and `pnpm test:browser` delegate to this package.

Add shadcn/ui primitives from this package directory with
`pnpm dlx shadcn@latest add <component>`. Keep generated primitives in
`components/ui/`; compose product behavior outside that directory rather than
turning registry components into business-state owners.

The smoke probe is intentionally temporary. Browser tests, config, server
orchestration, traces, and future user-journey acceptance remain owned here when
the real components and API replace it.
