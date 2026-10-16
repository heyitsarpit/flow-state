# Rust realization (target: rust)

Apply this guide to the assigned implementation or design proposal.
Historical Spec-section names describe design concepts, not required fields in a behavioral Spec.

Read when Rust is the chosen target. Apply choices in code or the requested proposal.
Select concrete APIs and crates after owner, failure, lifetime, and publication semantics are clear.

## Mapping

| Spec content             | Rust realization                                                                                             |
|--------------------------|--------------------------------------------------------------------------------------------------------------|
| `model` value            | a private-field newtype or struct with a smart constructor that checks admission invariants                  |
| `model` state            | an enum for closed variants; structs hold facts shared by those variants                                     |
| `model` transition       | a pure function for a pure change; an owner method when owned state changes                                  |
| `operations` entry       | a function or method; return `Result<Output, DomainError>` for expected failure                              |
| `concern` (transformer)  | a function that takes data and returns transformed data                                                      |
| `concern` (capability)   | a concrete dependency for one implementation; a trait when substitution or a boundary needs it               |
| `protocol`               | an owned value when retained or sent; borrow immutable data when its lifetime safely stays within the call   |
| `owner`                  | a private struct with private state and narrow methods; construct it at its declared lifetime boundary       |
| `composition.boundaries` | a function or method signature carrying the named protocol and established facts                             |
| `rules.publication`      | the indivisible state change or event visibility promised by the Spec, not a prescribed synchronization type |
| `model` error            | a named error enum in `Result`; keep cancellation and panics distinct from domain failures                   |
| `composition.uses`       | pass data as arguments; pass local dependencies concretely and use trait bounds or trait objects when needed |
| `tests`                  | Public-boundary checks for relevant contract outcomes under testing-policy                                   |

Keep fields private when callers must not bypass a value or owner invariant. Use a smart constructor at the admission boundary; a type alone does not prove data that arrived from an untrusted source is valid. Model closed alternatives with enums and avoid encoding illegal states as unrelated optional fields.

Choose a concrete dependency when the owner has one implementation and callers do not need replacement. Use a trait when multiple implementations are real, a boundary needs a test substitute, or behavior must be generic; choose a generic bound or trait object according to whether implementation identity belongs in the type or is selected at runtime. Do not add a trait solely to call every dependency a capability.

## Ownership, lifetimes, and publication

- Keep owner fields private and expose only operations that preserve its invariants. A private constructor or `new` function is ordinary Rust construction, not a framework owner type.
- Borrow for synchronous work that does not retain data. Own data when storing it, moving it to another task, or keeping it beyond the borrower's lifetime. Make clones explicit where shared handles or snapshots are part of the contract.
- Require `Send` or `Sync` only when the contract shares a value across threads. `Arc`, locks, and atomics are choices for an established sharing and mutation model, not default wrappers for every owner.
- Decide what observers must see together before choosing publication: a lock-backed snapshot can expose a consistent state; a watch-style channel suits latest-state observation; a broadcast-style channel suits event delivery when loss and lag behavior are specified. Preserve the Spec's publication and bounds regardless of primitive.
- Use `async` only for genuinely asynchronous operations. Dropping a future stops its further polling but does not roll back completed external effects; state interruption outcomes and cleanup in the Spec. Keep work within the owner lifetime, and do not detach tasks unless their lifetime and failure handling are part of the contract.
- Keep async APIs runtime-neutral when the host should choose the executor. Add runtime-specific bounds or APIs only where the host contract requires them; `Send` is not an automatic requirement for every future.

Use ecosystem crates when a concrete need warrants them: serialization at a wire boundary, an executor or timer supplied by the host, or a channel implementation matching the decided delivery and backpressure contract. No one crate is the default for every realization.

## Deterministic test seams

Pass a clock, scheduler, or external operation as a dependency only when the behavior needs control or substitution. Use a small fake or closure where sufficient; introduce a trait when multiple implementations or a stable test boundary justify it. Drive time and completion explicitly instead of sleeping, and test cancellation around side effects that may already have completed.
