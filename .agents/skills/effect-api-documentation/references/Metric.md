# `Metric`

Source: [Effect v4 `Metric` API](https://www.effect.website/docs/v4/api/effect/Metric). Examples assume `import { Metric } from "effect"`.

## API index

1. [Metric.counter](#metriccounter)
2. [Metric.update](#metricupdate)
3. [Metric.value](#metricvalue)
4. [Metric.gauge](#metricgauge)
5. [Metric.histogram](#metrichistogram)
6. [Metric.timer](#metrictimer)
7. [Metric.frequency](#metricfrequency)
8. [Metric.withAttributes](#metricwithattributes)
9. [Metric.snapshot](#metricsnapshot)
10. [Metric.summary](#metricsummary)
11. [Metric.modify](#metricmodify)
12. [Metric.mapInput](#metricmapinput)
13. [Metric.linearBoundaries](#metriclinearboundaries)
14. [Metric.exponentialBoundaries](#metricexponentialboundaries)
15. [Metric.dump](#metricdump)
16. [Metric.enableRuntimeMetrics](#metricenableruntimemetrics)
17. [Metric.disableRuntimeMetrics](#metricdisableruntimemetrics)

### Additional known APIs (not expanded)

`Metric`, `Counter`, `CounterState`, `Frequency`, `FrequencyState`, `Gauge`, `GaugeState`, `Histogram`, `HistogramState`, `Summary`, `SummaryState`, `isMetric`, `summaryWithTimestamp`, `withConstantInput`, `boundariesFromIterable`, `snapshotUnsafe`, `CurrentMetricAttributesKey`, `CurrentMetricAttributes`, `MetricRegistry`, `FiberRuntimeMetricsKey`, `FiberRuntimeMetrics`, `FiberRuntimeMetricsImpl`, `enableRuntimeMetricsLayer`, `disableRuntimeMetricsLayer`

### [Metric.counter](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2174)

Creates a counter that accumulates numeric or `bigint` increments. Use `incremental: true` when the metric represents a delta stream rather than an absolute total.

```ts
const requests = Metric.counter("http_requests_total");
const record = Metric.update(requests, 1);
```

### [Metric.update](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2792)

Records an input in a metric. Counters add, gauges replace, and distribution metrics record an observation.

```ts
const active = Metric.gauge("active_users");
const setActive = Metric.update(active, 42);
```

### [Metric.value](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2679)

Reads the current state of a metric inside the current Effect context.

```ts
const requests = Metric.counter("requests");
const count = Metric.update(requests, 1).pipe(
  Effect.andThen(Metric.value(requests)),
);
```

### [Metric.gauge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2261)

Creates a metric for an instantaneous numeric value, such as queue depth, memory, or CPU usage.

```ts
const queueDepth = Metric.gauge("queue_depth");
const record = Metric.update(queueDepth, 12);
```

### [Metric.histogram](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2430)

Records numeric observations into configured buckets, making distributions and percentiles available from the metric state.

```ts
const latency = Metric.histogram("request_latency_ms", {
  boundaries: [50, 100, 250, 500, Infinity],
});
```

### [Metric.timer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2622)

Creates a histogram for `Duration` values and records them in milliseconds with a time-unit attribute.

```ts
const latency = Metric.timer("request_latency");
const record = Metric.update(latency, Duration.millis(120));
```

### [Metric.frequency](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2351)

Counts occurrences of string values, such as status codes, event names, or error categories.

```ts
const statuses = Metric.frequency("http_status");
const record = Metric.update(statuses, "200");
```

### [Metric.withAttributes](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2972)

Adds attributes to every operation on a metric. Each distinct attribute set is tracked as a separate metric series.

```ts
const requests = Metric.counter("http_requests").pipe(
  Metric.withAttributes({ method: "GET", route: "/users" }),
);
```

### [Metric.snapshot](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:3042)

Captures all registered metric metadata and state from the current context.

```ts
const report = Metric.snapshot.pipe(
  Effect.map((metrics) => metrics.map((metric) => metric.id)),
);
```

### [Metric.summary](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2518)

Creates a time-bounded summary that retains observations and calculates configured quantiles.

```ts
const latency = Metric.summary("latency", {
  maxAge: "5 minutes",
  maxSize: 1000,
  quantiles: [0.5, 0.95, 0.99],
});
```

### [Metric.modify](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2729)

Modifies a metric by its type-specific accumulation behavior; for a gauge it adds to the current value, while for a counter it increments.

```ts
const depth = Metric.gauge("queue_depth");
const increase = Metric.modify(depth, 1);
```

### [Metric.mapInput](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:2843)

Creates a metric view that accepts another input type and transforms it before updating the underlying metric.

```ts
const millis = Metric.timer("latency").pipe(
  Metric.mapInput((value: number) => Duration.millis(value)),
);
```

### [Metric.linearBoundaries](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:3395)

Builds normalized histogram boundaries from a linear sequence and appends positive infinity.

```ts
const boundaries = Metric.linearBoundaries({ start: 0, width: 100, count: 5 });
```

### [Metric.exponentialBoundaries](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:3455)

Builds histogram boundaries that grow by a factor, which is useful for values spanning multiple orders of magnitude.

```ts
const boundaries = Metric.exponentialBoundaries({ start: 1, factor: 2, count: 6 });
```

### [Metric.dump](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:3104)

Renders the current metric registry as a human-readable table for diagnostics.

```ts
const textReport = Metric.dump;
```

### [Metric.enableRuntimeMetrics](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:3910)

Enables automatic metrics for fibers created while the wrapped effect runs.

```ts
const measured = Metric.enableRuntimeMetrics(Effect.sleep("10 millis"));
```

### [Metric.disableRuntimeMetrics](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Metric.ts:3997)

Disables automatic fiber runtime metrics for a specific effect, even when they are enabled elsewhere.

```ts
const unmeasured = Metric.disableRuntimeMetrics(Effect.succeed("hot path"));
```
