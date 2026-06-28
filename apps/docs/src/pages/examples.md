# Examples

Launch Workspace is the flagship example for the current docs. It folds the original example pressure areas into one cohesive product surface: project editing, readiness metrics, asset upload, approval, assistant work, chat generation, and trace inspection.

The docs path uses Launch Workspace because it exercises resources, transactions, machines, modules, services, streams, child actors, app Layers, runtime handles, tests, and a few multi-source projections together.

## Flagship Example

| Product area | Flow State pressure                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| Overview     | Joins resource snapshots, child actors, receipts, and issues where a multi-source projection is useful. |
| Editor       | Separates canonical project data from draft process state and save conflicts.                           |
| Checklist    | Proves pure local flow context and `update` reducers.                                                   |
| Readiness    | Reads dashboard resource snapshots and invalidation facts.                                              |
| Assets       | Uses `flow.stream` with upload progress and a one-shot completion timer.                                |
| Approval     | Uses permission resources, redaction, and approval command gates.                                       |
| Assistant    | Supervises child actors and progress streams.                                                           |
| Chat         | Keeps a stream-backed actor alive across route detach and disposes it explicitly.                       |
| Trace        | Projects receipts, issues, stream snapshots, and child snapshots.                                       |

## Example Packages

| Package                     | Role                                                   |
| --------------------------- | ------------------------------------------------------ |
| `examples/launch-workspace` | Flagship API usage proof and source for docs snippets. |

## What To Read

Start with [Launch Workspace](/guide/launch-workspace) for the guided walkthrough. Use [Testing](/guide/testing) for executable proof patterns and [Current Status](/reference/status) for the exact executable matrix.

When older historical examples or notes differ from these docs, follow [Migration](/migration).
