# Plan 01 [North-star Project Editor example]

## Purpose

Design the first serious API shape by building an aspirational Project Editor example before implementing the real runtime.

## Scope

The example should show the desired user experience for:

- Loading cached remote data.
- Editing local draft state.
- Saving through a typed mutation.
- Handling typed failures.
- Modeling the workflow as explicit states.
- Testing machine behavior and typed API contracts.

## Procedure

1. Create `examples/project-editor`.
2. Define the domain model names and test scenarios.
3. Write the desired component usage.
4. Write the desired workflow file.
5. Write the desired service and fake service boundaries.
6. Write the desired tests.
7. Mark missing library pieces clearly.
8. Review the API names for friction.
9. Update the library reference with what survived.
10. Do not implement runtime internals unless a tiny stub is required to make the example readable.

## Acceptance Criteria

- The example makes the desired API visible.
- The test files show how users should verify flows.
- The example reveals at least five concrete API decisions.
- The plan is updated with open questions and next steps.

## Out Of Scope

- Full runtime.
- Real network layer.
- Production cache.
- Devtools.

## Open Questions

Empty until the example is started.
