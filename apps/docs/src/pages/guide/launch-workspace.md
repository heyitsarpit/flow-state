# Launch Workspace

Launch Workspace is the current flagship example. It proves the package against
one product-shaped app instead of a pile of isolated micro examples.

It is valuable because it exercises several runtime surfaces together. It is not
valuable because every file or UI decision should be copied as-is.

Treat it as proof coverage, not as the default starter architecture.

## What It Proves

| Surface      | Proof in the example                                                                    |
| ------------ | --------------------------------------------------------------------------------------- |
| Modules      | Named domains with dependencies, screens, fixtures, and inventory.                      |
| Resources    | Canonical shared project, permissions, readiness, assets, and approval data.            |
| Transactions | Save and approval writes with preview, rollback, invalidation, routes, and concurrency. |
| Machines     | Editor, assistant, chat, upload, and shell workflow state.                              |
| Views        | Overview, trace, and debug projections where direct reads would be awkward.             |
| App/runtime  | `flow.app`, `App.layer`, request boot, browser runtime, and runtime handles.            |
| Streams      | Upload progress, assistant progress, token streams, and cleanup.                        |
| Child actors | Assistant task supervision and failed-child retry.                                      |
| Testing      | App harnesses, resource seeds, stream probes, issues, receipts, and timer metadata.     |

## Recommended Reading Order

If you are using Launch Workspace as a source of truth, read it in this order:

1. `examples/launch-workspace/src/launchWorkspace.test.ts`
2. `examples/launch-workspace/src/launchWorkspaceStatus.ts`
3. `examples/launch-workspace/API_INVENTORY.md`
4. `examples/launch-workspace/src/launchWorkspaceAssembly.ts`
5. `examples/launch-workspace/src/launchWorkspaceShell.tsx`

`launchWorkspaceStatus.ts` is coarse package/descriptor metadata. Its
executable-plus-caveat taxonomy is useful navigation, but it is not Launch
runtime proof; `API_INVENTORY.md` is the current Launch-specific evidence
classification.

For the packet-level evidence, use
`examples/launch-workspace/API_INVENTORY.md`. Every row separates the
declaration, production owner, executing runtime path, observing test, and
evidence-derived status, while `API_CONTRACT.md` remains the governing public
contract. The inventory marks the seeded and
actor-owned resource paths as executable or partial based on tests; it does not
promote a descriptor to runtime behavior. In particular, standalone `flow.run`,
`flow.patch`, and `flow.after` remain contract-only in Launch-specific proof.

## Current App Router Pattern

The example proves a narrow but real Next.js App Router story:

- one request-scoped runtime per server request
- one versioned boot payload
- public resource hydration
- explicit actor snapshot restore
- one `"use client"` runtime boundary

That is the supported pattern to learn from. Broader SSR and RSC ownership are
outside this example's supported surface.

## Reuse The Contract, Not The Shell

The best parts to reuse are:

- ownership decisions
- service and Layer boundaries
- request boot and actor restore patterns
- app-level scenario tests
- child actor and stream lifecycle patterns

The parts to treat as example-specific are the shell composition, exact screen
breakdown, and anything the status registry marks unsupported.

The API inventory records the full retention-independent business-state rule
for the Readiness, product, and debug boundary.
