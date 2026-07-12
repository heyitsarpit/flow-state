# Phase 5 — Deletion, packed compatibility, documentation, and final correctness

[Back to the roadmap](../TASK.md)

Goal 5 closes the implementation. It may delete displaced code and align public
documentation, but it does not introduce a new architecture or feature family.

## P5.1 Delete displaced implementations

- Remove duplicate caches, actor/test engines, stream/timer/child owners,
  inspection builders, compatibility shims whose migration is approved, and
  obsolete exports/files with no supported callers.
- Prove static, dynamic, CLI, generated, example, package-export, and test callers
  before deleting. A bare search result is not sufficient for generated/CLI entry points.
- Keep supported aliases and wire forms until their explicit migration permits removal.
- Delete dead branches and wrappers rather than leaving disconnected fallback paths.

## P5.2 Packed public compatibility

- Install the produced package into representative core-only, React 18, React
  19, testing, server, inspect, and Launch Workspace consumers.
- Prove supported root/subpath exports, peer behavior, ESM-only contract,
  environment neutrality, executable behavior, and exact declarations.
- Reject private/deep imports, private-name leakage, TS7056/excessive-depth
  failures, duplicate-package ownership aliasing, and type-erasing annotations.
- Package size, gzip, compiler timing, throughput, and growth statistics are not gates.

## P5.3 Documentation truth

- Document only shipped calls and executable behavior. Remove migration/run/phase
  vocabulary from durable user guidance.
- Keep API, testing, React, server, inspection/CLI, compatibility aliases,
  environment support, and known limits aligned with live code.
- Prefer executable examples and docs build over tests that assert prose contains
  particular phrases.

## P5.4 Final correctness closure

- Reconcile public exports, declarations, compatibility corpus, owner map, known
  defects, behavior/type inventories, and dead-code inventory against live code.
- Run the full affected runtime, type, packed-client, Launch Workspace, and docs
  verification. Fix every correctness/type-safety blocker.
- Review once for compatibility, identity, ownership, Effect channels, stale
  generations, atomicity, finalization, adapter thinness, diagnostics, and docs truth.
- Feature deferral is valid only when the active public contract already permits
  it and names a later owner; correctness failures are not deferred.

## Final definition of done

- One semantic owner remains per capability and adapters contain no shadow engines.
- Exact Effect/Stream/Layer types and lifecycle/finalizer behavior are proved.
- Source, packed, runtime, wire, and environment compatibility agree.
- Supported documentation matches executable truth.
- Full affected verification passes without accepted failures.
- Review 5 independently re-derives these claims and marks the roadmap complete.
