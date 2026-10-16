# Websites and browser applications

1. Separate document delivery, first useful content, loading, interactions, rendering, and memory.
   Measure representative devices, network conditions, navigation types, and cold/warm caches.

2. Trace server work, network waterfalls, resource discovery, transfer sizes, parsing/execution,
   hydration where applicable, layout, and paint. Distinguish frontend delay from backend delay.

3. Set budgets for critical resources and user outcomes. Reduce unnecessary JavaScript; split/defer
   code and optimize assets with explicit loading priority. Choose static/server/client rendering
   based on workload, freshness, and interaction needs.

4. Cache at appropriate browser/CDN/server layers with correct keys, privacy boundaries, and
   invalidation. Avoid adding latency through indiscriminate preload, prefetch, or third-party
   scripts.

5. Profile expensive updates, long tasks, large DOM collections, and redundant render work. Use
   virtualization or workers when benefits exceed interaction/accessibility and transfer costs.

6. Verify actual content and interactions, not just placeholders; include low-end hardware, slow
   networks, repeated navigation, and cache invalidation.

## Sources

- [Performance budgets](https://web.dev/articles/performance-budgets-101)
- [Learn Performance](https://web.dev/learn/performance)
