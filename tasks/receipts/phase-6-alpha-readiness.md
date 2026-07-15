# Phase 6 alpha-readiness receipt

Date: 2026-07-15

## Candidate

- Package: `flow-state@0.1.0-alpha.0`
- License: `Apache-2.0`, with the canonical license text included in the archive
- Artifact: `artifacts/flow-state-0.1.0-alpha.0.tgz`
- SHA-256: `70250a1ca6219b68fdc806d75ef5d063c651feab212ab886aa745de972251cf8`
- Local install: `pnpm add ./artifacts/flow-state-0.1.0-alpha.0.tgz`

The release owner inspects the archive, rejects private workspace paths, checks
the packed manifest and supported entrypoints, installs this exact archive in the
strict consumer matrix, and writes the checksum only after those consumers pass.

## Verification

- `pnpm fmt`
- `pnpm lint`
- `pnpm verify` reached 128 passing test files and 1,077 passing tests, source and
  packed declarations, strict consumers, all six application builds, and installed
  CLI evidence. Its browser stage exposed `BUG-115`; after correction, the
  deterministic store regression and formerly failing real two-context browser
  workflow pass. One clean end-to-end rerun remains the P6.4 closure gate.
- `pnpm --filter @flow-state/incident-console test:acceptance`: all 10 workflows,
  including the standalone API restart, against real HTTP and SSE boundaries
- `pnpm --filter flow-state release:candidate`: exact-artifact consumer matrix,
  archive inspection, and checksum generation

No failure is accepted. The CLI error lines emitted during `pnpm test` are the
asserted output of intentional invalid-input cases.

## Thermo-nuclear disposition

The final review covered changed runtime owners, public and packed declarations,
the flagship production tree and real network boundary, CLI, documentation,
package metadata, and release scripts. It recorded and resolved `BUG-107` through
`BUG-114`, including SSE cursor validation, explicit child restore/activate mode,
exact-artifact auditing, the wrong onboarding repository link, the oversized API
facade, and public `any` erasure.

Approval Bar: **approved, pending only the broad command rerun**. The reviewed
tree has no blocking or presumptive-blocker finding: the changed structure is
decomposed below 1,000 lines per new owner,
Effect A/E/R and routed events remain exact, expected failures keep their typed
lanes, resource/mutation/stream/child ownership stays canonical, and real network,
time, replacement, cleanup, packed, and declaration behavior has deterministic
evidence.

## Alpha limits and publication

The user-visible limits remain in `packages/flow-state/RELEASE_NOTES.md` and
`apps/docs/src/pages/reference/status.mdx`: the alpha excludes a complete
hierarchical/parallel/history statechart model, generalized persistence and
offline support, router/forms/auth integration, non-React adapters, and a hosted
inspection console; it pins `effect@4.0.0-beta.86`.

The exact publish command is:

```sh
pnpm publish ./artifacts/flow-state-0.1.0-alpha.0.tgz --tag alpha --access public
```

It was reported only. No package, tag, or external release was published.
