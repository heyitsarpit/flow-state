# Frontend loading and responsiveness

- Reduce shipped JavaScript and use code splitting or deferred loading where it improves critical
  paths.
- Improve resource discovery and loading order; optimize images and other transferred assets.
- Reduce unnecessary rendering and expensive render computations; profile before applying
  memoization.
- Virtualize large rendered collections when full rendering dominates and accessibility/interaction
  requirements allow it.
- Move CPU-heavy work to web workers when transfer costs permit; keep the UI thread responsive.
- Measure loading, interactions, rendering, and memory on representative devices rather than only a
  development workstation.
