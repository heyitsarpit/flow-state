# Examples

The docs currently revolve around one example package:

- `examples/launch-workspace`

Use it as proof coverage, not as a starter template.

If you want the shortest explanation of why the module/app/runtime layering
exists before diving into the example, start with
[Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).
If you want the shortest app-level onboarding and planning surface for the
generated behavior contract, start with
[Behavior Contract](/reference/behavior).

## Read These Files First

| Goal                           | Best file                                                  |
| ------------------------------ | ---------------------------------------------------------- |
| App assembly and runtime setup | `examples/launch-workspace/src/launchWorkspaceAssembly.ts` |
| Feature and API proof contract | `examples/launch-workspace/src/launchWorkspace.test.ts`    |
| Supported surface matrix       | `examples/launch-workspace/src/launchWorkspaceStatus.ts`   |
| Browser shell usage            | `examples/launch-workspace/src/launchWorkspaceShell.tsx`   |

For the real walk-through, use [Launch Workspace](/guide/launch-workspace).
