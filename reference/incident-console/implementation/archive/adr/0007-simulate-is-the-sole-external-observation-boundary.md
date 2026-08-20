# Simulate is deferred from the first function-mocking slice

Status: superseded by ADR-0008

This ADR recorded an earlier direction in which `simulate(...)` was the sole Story-facing mechanism for
supplying an external Effect or Stream observation. It is retained as design history only.

The accepted direction is now recorded in ADR-0008: whole service functions supplied by an Implementation
are the first Story mocking boundary. `simulate(...)` is deferred until a concrete pending external-work
use case requires a separate contract.
