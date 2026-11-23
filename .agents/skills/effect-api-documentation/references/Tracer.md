# `Tracer`

Source: [Effect v4 `Tracer` API](https://www.effect.website/docs/v4/api/effect/Tracer). Examples assume `import { Effect, Tracer } from "effect"`.

`Tracer` provides tracing context and span instrumentation for following work and causal relationships across Effect boundaries.

## API index

1. [Tracer.Tracer](#tracertracer)
2. [Tracer.externalSpan](#tracerexternalspan)
3. [Tracer.ParentSpan](#tracerparentspan)
4. [Tracer.make](#tracermake)
5. [Tracer.Span](#tracerspan)
6. [Tracer.DisablePropagation](#tracerdisablepropagation)
7. [Tracer.MinimumTraceLevel](#tracerminimumtracelevel)
8. [Tracer.CurrentTraceLevel](#tracercurrenttracelevel)

### Additional known APIs (not expanded)

`EffectPrimitive`, `SpanStatus`, `AnySpan`, `ParentSpanKey`, `ExternalSpan`, `SpanOptions`, `SpanOptionsNoTrace`, `TraceOptions`, `SpanKind`, `SpanLink`, `TracerKey`, `NativeSpan`

### [Tracer.Tracer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tracer.ts:585)

The context reference for the active tracing backend. Effect uses its default native tracer unless another `Tracer` service is provided.

```ts
const current = Effect.gen(function*() {
  return yield* Effect.service(Tracer.Tracer);
});
```

### [Tracer.externalSpan](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tracer.ts:447)

Creates a span value from identifiers supplied by another tracing system, so it can become a parent or link for Effect spans.

```ts
const parent = Tracer.externalSpan({ spanId: "span-1", traceId: "trace-1" });
const child = Effect.succeed("ok").pipe(
  Effect.withSpan("child", { parent }),
);
```

### [Tracer.ParentSpan](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tracer.ts:168)

Provides the current parent span as a context service for code that needs to inspect or propagate span identity.

```ts
const parentId = Effect.gen(function*() {
  return (yield* Effect.service(Tracer.ParentSpan)).spanId;
});
```

### [Tracer.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tracer.ts:419)

Wraps a tracing implementation that creates a `Span` for each span request. Use it when integrating a custom tracing backend.

```ts
const tracer = Tracer.make({
  span: (options) => new Tracer.NativeSpan(options),
});
```

### [Tracer.Span](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tracer.ts:349)

Represents an Effect-created span with identity, parent information, attributes, links, status, and lifecycle methods.

```ts
const annotate = (span: Tracer.Span) => {
  span.attribute("request.id", "req-1");
  return span;
};
```

### [Tracer.DisablePropagation](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tracer.ts:491)

Disables trace-context propagation for the provided scope, causing new spans there to avoid inheriting a parent.

```ts
const isolated = Effect.succeed("background work").pipe(
  Effect.provideService(Tracer.DisablePropagation, true),
);
```

### [Tracer.MinimumTraceLevel](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tracer.ts:543)

Sets the minimum trace level whose spans are sampled by default. Explicit `sampled` span options take precedence over this threshold.

```ts
const sampled = Effect.succeed("ok").pipe(
  Effect.provideService(Tracer.MinimumTraceLevel, "Warn"),
);
```

### [Tracer.CurrentTraceLevel](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Tracer.ts:514)

Sets the current default trace level used when a span does not specify its own level.

```ts
const traced = Effect.succeed("ok").pipe(
  Effect.provideService(Tracer.CurrentTraceLevel, "Debug"),
);
```
