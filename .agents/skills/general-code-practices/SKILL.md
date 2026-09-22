---
name: general-code-practices
description: Apply a concise catalog of general coding practices for ownership, state, APIs, types, failures, concurrency, boundedness, complexity, testing, and maintainability. This skill supplies principles only; repository roles and contracts decide how they are enforced.
---

# General Code Practices

Use only the practices relevant to the code being changed. Product behavior and
repository contracts take precedence. A cleanliness improvement must not weaken
features, widen authority, or add speculative abstraction.

| ID      | Practice                                 | Prefer                                                                                                               | Avoid                                                                                                            |
| ------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GP-01` | One owner and explicit lifetime          | Keep each mutable fact, resource, registration, and terminal result with one named owner.                            | Hidden globals, shadow registries, split authority, and duplicate cleanup.                                       |
| `GP-02` | Make illegal states unrepresentable      | Model real states as closed variants with exhaustive transitions.                                                    | Boolean soup, contradictory optional fields, and catch-all branches.                                             |
| `GP-03` | Capture and validate once                | Capture caller input at the boundary, validate once, and pass an owned typed value inward.                           | Re-reading mutable input, repeated decoding, and time-of-check/time-of-use drift.                                |
| `GP-04` | Preserve exact types and least authority | Retain useful generic and error relationships; expose the narrowest capability a consumer needs.                     | `any`, widened `unknown`, mutable exports, unsafe recovery, and broad owner handles.                             |
| `GP-05` | Keep failures in the correct channel     | Represent expected failure explicitly and preserve defects, interruption, and cleanup causes.                        | Throwing expected failures, swallowing interruption, and collapsing distinct causes.                             |
| `GP-06` | Define atomicity and visibility          | Name the commit point; keep earlier work fallible and rollback-owned, and make the committed transition total.       | Check-then-act races, partial visibility, duplicate creation, and lost wakeups.                                  |
| `GP-07` | Keep external work outside locks         | Hold synchronization only for short state transitions; settle an exact in-flight token afterward.                    | Awaiting callbacks, I/O, cleanup, or cross-owner work while locked.                                              |
| `GP-08` | Use structured concurrency               | Scope every task to an owner, join or interrupt it at close, and mask only atomic claim or settlement.               | Detached work, abandoned cleanup, blanket uninterruptibility, and unjoinable shutdown.                           |
| `GP-09` | Bound work and schedule fairly           | Bound or coalesce queues, subscribers, fanout, retries, and worklists; define progress and fairness.                 | Unbounded retention, caller-sized concurrency, starvation, busy loops, and scheduler luck.                       |
| `GP-10` | Check monotonic authority values         | Check sequences, revisions, generations, ordinals, and epochs before incrementing.                                   | Numeric wraparound, ABA reuse, stale-token acceptance, and partial overflow mutation.                            |
| `GP-11` | Publish immutable owned data             | Copy or encapsulate mutable input and expose readonly values, views, or narrow queries.                              | Escaped mutable collections, freezing caller data, and unspecified cycle or identity behavior.                   |
| `GP-12` | State complexity and retention costs     | Use iterative traversal for caller-sized data, keyed lookup for canonical identity, and explicit eviction points.    | Recursive stack risk, repeated whole-world scans, quadratic membership, and append-only history.                 |
| `GP-13` | Prefer the smallest real abstraction     | Use plain data and functions by default; add a service or object when it owns real state, lifetime, or substitution. | Forwarding wrappers, generic managers, duplicate protocols, and speculative helpers.                             |
| `GP-14` | Test production behavior                 | Inject capabilities or synchronize the real production path with deterministic clocks and gates.                     | Test-only production branches, behavior-changing probes, module-state fixtures, and sleep-based synchronization. |
| `GP-15` | Make important rules executable          | Back adopted rules with focused type, static, behavior, boundary, or absence checks.                                 | Permanent waivers, unproved casts, vague diagnostics, and deletion without absence proof.                        |

These are defaults, not a substitute for domain contracts, framework guidance,
security requirements, accessibility requirements, or compatibility policy.
