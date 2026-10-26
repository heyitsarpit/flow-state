# References for the Flow State plans

[FlowState.plan](../FlowState.plan) is the entry plan; the capability plans beside it own the
contracts. Everything here supports them. Where a document here and a plan differ, the plan wins.

| Reference | What it is |
| --- | --- |
| [dispatch-desk/](dispatch-desk/README.md) | the reference application, written against the plans |
| [design/minimal-library.md](design/minimal-library.md) | the actor, operation, view and testing surface, and the table of removed surfaces |
| [design/entity-domain.md](design/entity-domain.md) | entity domains: the design behind EntityDomains.plan |
| [design/entity-domain-examples.md](design/entity-domain-examples.md) | seven applications written with entity domains |
| [design/entities.md](design/entities.md) | the entity layer's goals and correctness properties C1 to C8 |
| [design/server-rendering.md](design/server-rendering.md) | SSR hydration: the design behind ServerRendering.plan |
| [design/lazy-features.md](design/lazy-features.md) | lazy-loaded features: the design behind LazyFeatures.plan |
| [design/principles.md](design/principles.md) | the design checklist |
| [design/multi-tab.md](design/multi-tab.md) | shared multi-tab persistence; deferred, not version 1 |
| [design/sync-engine-adapter.md](design/sync-engine-adapter.md) | the tier-2 sync engine plug-in point; deferred, not version 1 |

Some design documents predate later decisions. In version 1, SSR hydration and lazy features are
in; Suspense, multi-tab sharing and sync engines are out. The plans state the decided behaviour.

The archived plans under [workflow/plans/archive](../../archive/) are provenance only.
