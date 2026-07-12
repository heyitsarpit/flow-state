# Phase 0 Test Checklist

This checklist is the failing-first contract extracted from
`src/launchWorkspace.test.ts`, regrouped by ownership so Phase 1 can rebuild the
package surface without dragging future runtime work forward.

## Package Surface

- [ ] `packages/flow-state/src/public-api-types.test.ts` proves the public
      exports: root `flow` plus `flow-state/testing`
      `flowTest` and `createControlledStream`
- [ ] Active package tests avoid legacy write-compatibility aliases

## Executable-Truth Inventory

- [ ] Every API row in `API_INVENTORY.md` has separate declaration, production
      owner, runtime execution, test observation, and status facts.
- [ ] Status is one of `executable`, `partial`, `contract-only`, `deferred`, or
      `broken`; a descriptor alone never earns `executable`.
- [ ] `flow.ensure`, `flow.refresh`, and `flow.invalidate` are executable where
      Launch asserts their distinct runtime facts; `flow.observe` stays partial,
      while `flow.run`, `flow.patch`, and `flow.after` stay contract-only until
      Launch drives their distinct behavior.
- [ ] The inventory links the governing `API_CONTRACT.md`; it does not recreate
      the removed `reference-next/lib-api.md` authority.

## Session And Shared Resources

- [ ] Session permissions resource and policy ownership
- [ ] Project resources (`Project.byId`, `Project.comments`)
- [ ] Launch resources (`launch.project`, `launch.permissions`, `launch.readiness`,
      `launch.assets`, `launch.approval`)

## Transactions

- [ ] Project save descriptor shape
- [ ] Approval request descriptor shape
- [ ] Preview patch and rollback failure lane
- [ ] Transaction issue lane uses `source: "transaction"`

## Machines, Children, And Streams

- [ ] Project editor machine descriptors
- [ ] Launch Workspace machine descriptors
- [ ] Assistant child lifecycle and retry-only-failed-child coverage
- [ ] Upload, assistant, and chat stream descriptors

## Runtime, Views, And Harness

- [ ] Module inventory and app inventory
- [ ] `App.layer` and runtime descriptor ownership
- [ ] View projections read transactions, receipts, children, and resources without
      owning side effects
- [ ] `flowTest` and `test.app(...)` stay as fact surfaces, not assertion DSLs

## Future Markers

- [ ] Offline queue, undo, and reconnect replay stay parked until Phase 7 reopens
      queue semantics intentionally.
- [x] Virtual time and bounded `settle(...)` are now part of the testing surface.

## P4A.3 Read-Model Boundary

- [ ] Keep the receipt-derived Readiness/product/debug limitation assigned to
      P4A.3 and use `API_INVENTORY.md` as the full boundary statement.
