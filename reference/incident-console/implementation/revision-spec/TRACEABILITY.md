# Revision traceability

Status: verified standalone audit ledger

This optional, non-normative ledger proves that the self-contained specification preserves every accepted
decision from its historical sources without importing unaccepted material. It is audit evidence, not
part of the implementation reading path. Source spans may map to several revision IDs when one accepted
passage contains independently implementable rules, but every normative revision must have at least one
accepted source span.

## Accepted-source coverage

| Source span                                        | Revision IDs                                         | Disposition          | Audit notes                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DESIGN_REVISIONS.md:15-157`                       | `REV-COMP-001`–`005`                                 | Ported               | Context declaration, propagation, bootstrap, binding, disposal, dehydration, and hydration                                  |
| `DESIGN_REVISIONS.md:158-216`                      | `REV-COMP-006`–`008`                                 | Ported               | Named modules, flattened closed `App.M`, tooling-only module identity, and removed roots                                    |
| `DESIGN_REVISIONS.md:219-247`                      | `REV-COMP-009`–`010`, `REV-MACH-001`, `REV-OPS-001`  | Ported               | Input, boundary ownership, child removal, and named operation authoring                                                     |
| `DESIGN_REVISIONS.md:249-252`                      | `NON_GOALS.md`                                       | Deferred             | Singleton, toggle, and debounce shorthand remain non-normative                                                              |
| `DESIGN_REVISIONS.md:254-335`                      | `REV-MACH-002`–`011`                                 | Ported               | Recursive states, defaults, handlers, matches, activities, timers, redirects, finality, reentry, and depth                  |
| `DESIGN_REVISIONS.md:337-360`                      | `REV-OPS-001`, `REV-COMP-007`                        | Ported               | Closed named catalogue, inert declaration, and static AppPlan reachability                                                  |
| `DESIGN_REVISIONS.md:362-399`                      | `REV-OPS-002`–`003`                                  | Ported               | Canonical key domain and executable-input generation ownership                                                              |
| `DESIGN_REVISIONS.md:401-451`                      | `REV-OPS-004`–`008`, `REV-OPS-012`                   | Ported               | Runtime store, family methods, finite actions, memory-derived continuing work, atomic macrostep, and cross-resource actions |
| `DESIGN_REVISIONS.md:453-465`                      | `REV-OPS-009`                                        | Ported               | Selector suppression and normalized operation retention                                                                     |
| `DESIGN_REVISIONS.md:467-479`                      | `NON_GOALS.md`                                       | Deferred             | Runtime-sized continuing collections remain outside accepted rules                                                          |
| `DESIGN_REVISIONS.md:481-541`                      | `REV-OPS-010`–`014`                                  | Ported               | Fencing, cancellation, clearing, transaction/stream mappings, hydration boundaries, and stream value retention              |
| `DESIGN_REVISIONS.md:543-545`                      | `REV-OPS-001`, `NON_GOALS.md`                        | Ported and deferred  | Named-family decision and shorthand baseline                                                                                |
| `DESIGN_REVISIONS.md:547-691`                      | `REV-HOST-001`–`005`, `REV-MIG-003`                  | Ported               | React creation, production lifecycle, evidence, suspension, resumption, terminal disposal, and proofs                       |
| `DESIGN_REVISIONS.md:692-694`                      | `REV-TEST-010`, `REV-MIG-003`                        | Ported               | Exact live-host and Story domain-command parity                                                                             |
| `DESIGN_REVISIONS.md:696-809`                      | `REV-COMP-011`–`015`                                 | Ported               | Actor refs, construction/lookup, owner leases, tombstones, Story ownership, and bootstrap                                   |
| `DESIGN_REVISIONS.md:811-857`                      | `REV-HOST-006`                                       | Ported               | Exact passive views and removed registered-view surface                                                                     |
| `DESIGN_REVISIONS.md:859-862`                      | `REV-HOST-001`, `REV-HOST-006`, `REV-COMP-011`–`012` | Cross-check          | Accepted local/shared actor, exact ref, lookup, and reactive-read summary                                                   |
| `DESIGN_REVISIONS.md:864-1128`                     | `REV-TEST-001`–`010`                                 | Ported               | Story construction, local actors, commands, simulation, time, evidence, models, and runtime parity                          |
| `DESIGN_REVISIONS.md:1130-1184`                    | `REV-MIG-001`–`003`                                  | Ported               | Closed public decisions and coordinated migration                                                                           |
| Revision-spec deletion review accepted by the user | `REV-MIG-004`, `DEL-001`–`011`, `RET-001`–`005`      | Accepted             | Exhaustive old-surface dispositions, no-residue cutover, retained boundaries, and absence proofs                            |
| `DESIGN_REVISIONS.md:1187-1210`                    | `REV-COMP-006`–`010`                                 | Cross-check          | Composition, input, module, and app-admission summary                                                                       |
| `DESIGN_REVISIONS.md:1212-1247`                    | `REV-MACH-001`–`011`                                 | Cross-check          | Compound-state and handler summary                                                                                          |
| `DESIGN_REVISIONS.md:1248-1250`                    | `NON_GOALS.md`                                       | Deferred cross-check | Singleton, toggle, and debounce shorthand remain deferred                                                                   |
| `DESIGN_REVISIONS.md:1252-1303`                    | `REV-COMP-001`–`005`                                 | Cross-check          | Reactive-context summary                                                                                                    |
| `DESIGN_REVISIONS.md:1304-1364`                    | `REV-HOST-001`–`006`, `REV-COMP-011`–`015`           | Cross-check          | React, refs, leases, lookup, disposal, and bootstrap summary                                                                |
| `DESIGN_REVISIONS.md:1366-1402`                    | `REV-TEST-001`–`010`                                 | Cross-check          | App/machine Story summary                                                                                                   |
| `DESIGN_REVISIONS.md:1403-1447`                    | `REV-OPS-001`–`009`                                  | Cross-check          | Operation catalogue, identity, actions, and selection summary                                                               |
| `DESIGN_REVISIONS.md:1448-1450`                    | `NON_GOALS.md`                                       | Deferred cross-check | Runtime-sized continuing collections remain deferred                                                                        |
| `DESIGN_REVISIONS.md:1451-1473`                    | `REV-OPS-010`–`014`, `REV-HOST-006`, `REV-MIG-002`   | Cross-check          | Fencing, cancellation, clearing, streams, passive views, and migration summary                                              |

## Referenced-source coverage

| Referenced source                                                  | Reason it is in scope                                   | Owning revision IDs                      | Audit notes                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `OPERATIONS_SPEC.md` exact passages cited by `DESIGN_REVISIONS.md` | Detailed working operation syntax and lifecycle support | `REV-OPS-001`–`014`                      | Supporting proposal text cannot independently add accepted semantics                   |
| `OPERATIONS.md:484-499`                                            | Explicit collection-API deferral                        | `NON_GOALS.md`                           | Deferred only                                                                          |
| `contracts/CLI.md:12-20`                                           | Existing module-slicing capability retained             | `REV-COMP-008`                           | Retained, not redesigned                                                               |
| `contracts/GLOSSARY_AND_IDENTITY.md:202-205`                       | Old lifecycle union explicitly superseded               | `REV-HOST-003`                           | Replacement is exact four-state union                                                  |
| `DESIGN_BEHAVIOR_GAPS.md:25-289`                                   | Required behavioral closure beneath accepted surface    | `UNRESOLVED_BEHAVIOR.md`, `REV-TEST-003` | 34 items remain open and non-normative; former `BEH-017` is accepted in `REV-TEST-003` |
| `DESIGN_BEHAVIOR_SOLUTIONS.md`                                     | Proposed internal answers                               | `NON_GOALS.md`, `UNRESOLVED_BEHAVIOR.md` | Not accepted and not imported into `REV-*` rules                                       |
| `DESIGN_BEHAVIOR_DISPOSITIONS.md`                                  | Proposed old-clause and artifact mapping                | `NON_GOALS.md`, `UNRESOLVED_BEHAVIOR.md` | Not accepted and not imported into `REV-*` rules                                       |

## Formalization decisions accepted on 2026-08-16

| Former gap     | Accepted side of the omission                                                          | Existing side of the omission                                   | Disposition                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SPEC-GAP-001` | Recursive identities and compound behavior at `DESIGN_REVISIONS.md:254-335`            | Flat state-node object at `contracts/PUBLIC_API.md:162-237`     | Resolved in `REV-MACH-003`: configuration recursively mirrors the exact definition tree through nested `states` records                                                  |
| `SPEC-GAP-002` | Story constructors and demonstrated options at `DESIGN_REVISIONS.md:864-988,1366-1383` | No complete replacement constructor-option declarations         | Resolved in `REV-TEST-001`: app, machine, and actor recipes have closed conditional option objects                                                                       |
| `BEH-017`      | Story-local actor recipes and exact context bindings                                   | Recipe-to-recipe provider representation and ordering were open | Resolved in `REV-TEST-003`: bindings accept exact compatible recipes or refs, preparation validates the graph, creation is provider-first, and cleanup is consumer-first |

## Independent audits

### Completeness audit

Passed on 2026-08-16 and refreshed after formalization acceptance. All 60 revision IDs remain present and
indexed exactly once. The 34 still-open inherited behavior entries remain in the blocker register; former
`BEH-017` and both former formalization gaps are recorded above and reproduced normatively in their owning
chapters.

### No-invention audit

Passed on 2026-08-16. Independent authority-partition and operations reviews originally withheld compound
syntax, constructor option types, and Story-local graph semantics until explicit acceptance. The later
formalization review accepted exactly those three answers; public helper exports, unrelated proof matrices,
diagnostic guarantees, state unions, hydration answers, transaction settlement rules, and zero-match
behavior remain unaccepted. Proposal-only answers remain unresolved, and historical paths occur only in
non-normative provenance.

### Cross-document consistency audit

Passed on 2026-08-16. Independent cross-chapter reviews reconciled composition, React, Story, operation,
migration, and proof ownership. Normative chapters contain no external Markdown link or semantic delegation;
all internal links resolve, fences are balanced, required revision fields are present, examples respect the
declared gaps, and no stale or undefined revision ID remains.

A follow-up read-only audit after the 2026-08-16 formalization acceptance confirmed that the recursive
configuration grammar, conditional Story option types, recipe-or-ref context graph, migration instructions,
resolved-history records, and remaining blocker register agree. It found 60 unique revision owners, 34 open
`BEH-*` entries, and no stale unresolved reference to either former `SPEC-GAP-*` item or `BEH-017`.
