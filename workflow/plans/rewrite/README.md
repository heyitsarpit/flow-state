# Capability Plans

This directory contains one [delivery entry Plan](ProjectDelivery.plan) and twelve capability
Plans. Read the entry first for their dependency order and staged execution.

This set is **proposed, pending approval**. The ten former flat Plans and the Rewrite Task graph
are archived as historical provenance. Their IDs and records remain in the archive; archived Plan
IDs remain discoverable for existing Spec references. Specs are unchanged. No implementation,
source cleanup or product cutover is claimed.

The twelve capability `.plan` files hold the complete proposed goals, outcomes,
API/type/behavior commitments, Verification targets, constraints and open Questions. Shared laws
cite their owning new Plan.
The [Dispatch Desk consumer reference](references/README.md) demonstrates authoring, application
structure, hosts, Stories, tests, and CLI usage. It adds no separate contract.

| Capability             | Owns                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| Statecharts            | Definitions, machine grammar, state paths, turns, timers and declarations |
| ApplicationsAndActors  | Composition, requirements, services, Runtime, refs, leases and context    |
| Resources              | Canonical data, passive reads, acquisition, freshness and retention       |
| Transactions           | Mutations, previews, concurrency, fencing and remote uncertainty          |
| Streams                | Continuing values, sessions, completion and release                       |
| ReactAndHosts          | React attachment/selectors, SSR, request isolation and host bridges       |
| Persistence            | Durable providers, selection, capture, restore and ordered writes         |
| StoriesAndModels       | Stories, fixtures, recipes, deterministic execution and pure models       |
| DiagnosticsContract    | Diagnostics, codes, Cause classification and boundary projection          |
| InspectionAndArtifacts | Inspection, evidence, trace/artifact codecs, sharing and comparison       |
| CommandLine            | Installed process grammar, gateway, files, output, signals and exits      |
| PackageContract        | Routes, declarations, supported consumers and compatibility/cutover gates |

The consumer reference is supportive and explicitly unverified. Historical source
coverage, author coordination and freeze/check evidence are external run metadata, not consumer
requirements. Questions identify unresolved exact source gaps; document validation does not close
those gaps or establish executable behavior.
