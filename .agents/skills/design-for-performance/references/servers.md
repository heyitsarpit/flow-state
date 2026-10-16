# Servers and APIs

1. Measure request classes, arrival rates, concurrency, p50/p95/p99 latency, successful throughput,
   errors, saturation, and cost per request. Include bursts and realistic payload distributions.

2. Trace queue wait, authentication, serialization, database calls, remote dependencies, compute,
   and response writing. Identify N+1 queries, fan-out, duplicate calls, and retry amplification.

3. Bound admission, queues, connection pools, concurrency, and retries. Propagate deadlines and
   cancellation; define overload rejection and protect critical work. Avoid retrying non-idempotent
   operations without a safe protocol.

4. Reduce round trips, reuse connections, batch compatible requests, and cache with explicit
   consistency/invalidation rules. Partition ownership when shared state dominates; account for hot
   keys and skew.

5. Load-test saturation and recovery with a harness that models arrival rate and reports offered,
   completed, rejected, and failed work. Test slow dependencies and partial failures. Do not hide
   overload by measuring only successful fast requests.

## Sources

- [Google SRE monitoring](https://sre.google/sre-book/monitoring-distributed-systems/)
- [Google SRE overload](https://sre.google/sre-book/handling-overload/)
- [USE Method](https://www.brendangregg.com/usemethod.html)
