# Examples

The maintained examples cover one focused behavior each:

- `examples/basic-cached-posts`
- `examples/optimistic-transactions`
- `examples/bounded-infinite-feed`
- `examples/server-prefetch-hydration`
- `examples/offline-recovery`
  Use the five recipes as starter-sized proofs.

If you want the shortest explanation of why the module/app/runtime layering
exists before diving into the example, start with
[Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).
If you want the job-by-job terminal workflow for declared facts, path
discovery, scenario execution, and trace analysis, start with
[Agent Workflow](/guide/agent-workflow).
If you want the shortest app-level onboarding and planning surface for the
generated behavior contract, start with
[Behavior Contract](/reference/behavior).

## Read These Files First

| Goal                           | Best file                                                       |
| ------------------------------ | --------------------------------------------------------------- |
| App assembly and runtime setup | `examples/basic-cached-posts/src/app`                           |
| Runtime behavior proof         | `examples/basic-cached-posts/src/testing/posts-runtime.test.ts` |
| Supported surface matrix       | `examples/FEATURE_COVERAGE.md`                                  |
