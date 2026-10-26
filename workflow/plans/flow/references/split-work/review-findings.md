# Review findings that touch plan semantics (from eight reviews: four Opus, four Sol)

Full Sol texts: scratchpad/reviews2/sol-{fidelity,behaviour,plan,build}.md. Reference-app bugs
are fixed separately by the owner; this list is what plans must specify.

Runtime and actors
- Actor identity and disposal: conflicting ref options; the disposing state; provider disposal;
  re-ensure; what retain's "last use" means (decisions 8, 9).
- Bootstrap: storage must be acquired before persisted data is validated, then app services
  (Sol plan F1). Test acquisition failure, invalid persisted data, disposal races, simultaneous
  same-scope readiness.
- Target admission for actor-to-actor send: reserved before sender commit or can fail after;
  overloaded or disposing target; diagnostic ownership (Sol plan F5).
- Composite ref ids built by string joining collide ("a/b"+"c" vs "a"+"b/c"); the identity rule
  must take id parts and encode them unambiguously (Sol fidelity 3).
- A principal switch needs a new Runtime (the reference's "user switch" in one Runtime conflicts).

Machines
- Schedule lifetime and restore; Duration fires once; the restartOn baseline (first value does not
  fire); restartOn equality.
- process() and a send-cycle bound (decision 1).
- An `unknown` save outcome needs an actionable exit (the reference stays in SAVING): plans must
  say outcomes.unknown is a normal internal event and recommend authoring an uncertainty state.

Operations
- Commit write ordering; revert fencing; overlapping optimistic writes; serialize applies
  optimistic writes at dequeue.
- O5 lacks result / input Schemas and `basedOn` (entity).
- `cancel` is transaction-only; lane tag table; `.more` action vs field (rename field hasMore).
- value outcomes fed by predictions would let `saved` hold unconfirmed data (decision 12).
- Stream adapters return Streams: services reached with Stream.unwrap(Service.useSync(...)).
- A paged list's `total` metadata has no dependency rule (deleting an unheld record beyond loaded
  pages leaves it stale): either derive totals as a derived read or extend the dependency contract.

Persistence and tabs
- Version mismatch and corruption policy; the second-tab mechanism (now MultiTab).
- Stories must not touch real storage (decision ruling in Testing).

Testing
- Story persistence isolation; fixture composition order; checkpoint readers
  (`checkpoint.actor(ref)`), exact Denied shape, Ticket.get shape, propertyTest input generator
  representation, write generators, network/lifecycle controls, fixture-oracle access, shrinking.
- Story ids must be unique; deriving one Story from another must give it its own id.
- Model traversal through internal events (decision 2); model key comparison with live replay.

Inspection and tools
- Non-blocking, detach-on-failure inspector sink; attachInspector's return value.
- inspect(app) vs inspect(runtime) (decision 5); audit-mode configuration; incomplete flow check
  list; deny codes read from types (decision 28).
- Redacted checkpoints vs faithful reads (decision 4).

Build
- S6/S7 dependencies; V1 must compile the dispatch-desk reference, not minimal-library's editor;
  model mutation survivors need targeted proofs; S5 evidence now in references/evidence.
- O13 misdescribes code (no byte vectors in key.ts, no structural codec exists, runtime-next chosen
  over runtime/ without a reason) — owner fixes in FlowState.
