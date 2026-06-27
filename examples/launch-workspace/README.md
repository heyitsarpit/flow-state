# Launch Workspace

Status: vNext API proving app.

This example is intentionally contract-first. It wires the final-looking
`flow.module`, `flow.resource`, `flow.transaction`, `flow.machine`,
`flow.view`, `flow.app`, `App.layer`, and `flowTest` shapes while the runtime
catches up. Where `@flow-state/core` still exposes compatibility names, this
example keeps executable code on `flow.mutation`, `input`, `effect`, and
`flow.run`, but names the target concepts as transactions, `params`, and
`commit`.

What is real in this slice:

- domain schemas, branded IDs, typed failures, redacted approval fields, and
  fake Effect service Layers
- a cohesive Launch Workspace module graph covering Overview, Editor, Assets,
  Approval, Assistant, Chat, and Trace
- executable screen-level flow/view tests using current `flowTest`
- seeded app ResourceStore tests using `flowTest.app`
- preview project save transaction tests covering ResourceStore patch and
  rollback receipts
- API coverage tests that mark descriptor-only vNext surfaces explicitly
- a linked API inventory in `API_INVENTORY.md`
- a thin React shell that renders the product surface without pretending to be
  a production app

What is contract-only:

- live app-level ResourceStore `lookup` execution for `flow.resource`
- full `flow.transaction` probes beyond preview patch and rollback receipts
- `flow.ensure`, `flow.observe`, `flow.refresh`, `flow.patch`, and
  `flow.invalidate` live runtime behavior
- stream `subscribe` ownership, concrete subscription `unsubscribe`, service
  lifetime `dispose`, pressure counters, and state-scoped stream fibers
- `flowTest.advance` / `settle` virtual-time semantics
