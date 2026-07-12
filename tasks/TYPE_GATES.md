# Type correctness inventory

[Back to the roadmap](../TASK.md)

These `TI-*` invariants apply only when an active slice touches the corresponding
public type family. Runtime-only changes do not require unrelated packed/type
matrices. `TYPE_INFERENCE_CONTRACT.md` remains the detailed public contract.

- `TI-1` Resource, transaction, stream, machine, child, and view constructors
  preserve input-first inference, explicit-generic compatibility, and local errors.
- `TI-2` Definition types propagate through refs, bindings, routes, actors,
  snapshots, runtime, testing, React, server, inspection, and fixtures without restatement.
- `TI-3` `never` removes only impossible typed lanes; defect, interruption,
  cleanup, and other possible runtime lanes remain represented.
- `TI-4` Callback families receive exact inputs and reject unsafe narrower
  callbacks without bivariance or universal owner bags.
- `TI-5` Effect/Stream success, typed error, requirements, and Layer provision
  survive semantic seams and public declarations exactly.
- `TI-6` Module keys, definition maps, dependencies, app lookup, fixture names,
  and Layer requirements remain exact under reorder.
- `TI-7` Testing APIs infer exact app/machine/resource/family contracts and reject wrong owners.
- `TI-8` React actor/resource/view types remain exact in React 18/19 packed consumers.
- `TI-9` Source and packed declarations remain nameable and portable without
  TS7056, private-name leakage, excessive-depth failure, or type-erasing annotations.
- `TI-10` Each negative fixture proves one intended diagnostic and fails if the
  invalid program begins compiling.

## Surface-based proof

- Constructor/callback change: relevant positive and negative source fixtures.
- Common public owner or Layer change: exact `A/E/R` and directly affected consumers.
- React public change: affected React 18/19 consumer.
- Export/declaration change: package build and affected packed consumer.
- Internal runtime change with no public type effect: runtime tests only.

Shared public type files include `packages/flow-state/src/core/api/**`, public
entry points, `public-api-types.test.ts`, and `public-typing-architecture.test.ts`.
Do not broaden a slice merely to rerun every type family.
