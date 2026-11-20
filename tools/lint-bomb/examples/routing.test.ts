// Public-boundary checks: real JSON admission, class methods, constructors, and wire encoding.
import assert from "node:assert/strict";
import { describe, it } from "@effect/vitest";
import { isDeepStrictEqual } from "node:util";
import { Data, Effect, Exit, Layer, Ref, Result, Schema, SchemaIssue } from "effect";
import {
  DeliveryGateway,
  DeliveryOutcome,
  Incident,
  IncidentNotifier,
  PolicyDiagnostics,
  RoutingPolicy,
  encodePolicy,
  encodePolicySummary,
  loadPolicy,
  makeNotificationApp,
} from "./routing.ts";

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const example = {
  name: "Production incident routing",
  channels: [
    { _tag: "MailingList", id: "team", list: "engineering" },
    { _tag: "Webhook", id: "pager", url: "https://alerts.example.com/incidents" },
  ],
  routes: { warning: ["team"], critical: ["pager", "team"] },
};

describe("Routing policy and shared delivery gateway", () => {
  it("P01 admission applies defaults and preview preserves the admitted channel definitions", () => {
    const result = loadPolicy(json(example));

    assert(Result.isSuccess(result));
    assert(result.success instanceof RoutingPolicy);
    assert.equal(result.success.maxChannelsPerAlert, 4);
    assert.deepEqual(
      result.success.preview("warning").channels.map((channel) => channel.id),
      ["team"],
    );
    assert.deepEqual(
      result.success.preview("critical").channels.map((channel) => channel.id),
      ["team", "pager"],
    );
    assert.deepEqual(result.success.preview("critical").channels, [
      { _tag: "MailingList", id: "team", list: "engineering" },
      { _tag: "Webhook", id: "pager", url: "https://alerts.example.com/incidents" },
    ]);
  });

  it("P02 admission rejects malformed fields and incomplete or invalid tagged alternatives", () => {
    for (const input of [
      "{",
      json({ ...example, maxChannelsPerAlert: null }),
      json({ ...example, maxChannelsPerAlert: 0 }),
      json({ ...example, maxChannelsPerAlert: 1.5 }),
      json({ ...example, unexpected: true }),
      json({ ...example, routes: { warning: ["team"] } }),
      json({ ...example, routes: { ...example.routes, unknown: ["team"] } }),
      json({ ...example, channels: [{ _tag: "Unknown", id: "team" }] }),
      json({ ...example, channels: [{ _tag: "Webhook", id: "team" }] }),
      json({ ...example, channels: [{ _tag: "MailingList", id: "team", list: "unknown" }] }),
      json({
        ...example,
        channels: [{ _tag: "MailingList", id: "team", list: "engineering", url: "extra" }],
      }),
    ]) {
      assert(Result.isFailure(loadPolicy(input)), input);
    }
  });

  it("P03 all relationship failures carry the responsible configuration path", () => {
    const cases = [
      {
        input: { ...example, channels: [example.channels[0], example.channels[0]] },
        path: ["channels"],
      },
      {
        input: { ...example, routes: { ...example.routes, critical: ["missing"] } },
        path: ["routes", "critical", 0],
      },
      {
        input: { ...example, routes: { ...example.routes, warning: ["team", "team"] } },
        path: ["routes", "warning", 1],
      },
      { input: { ...example, maxChannelsPerAlert: 1 }, path: ["routes", "critical"] },
    ];

    const format = SchemaIssue.makeFormatterStandardSchemaV1();

    for (const { input, path } of cases) {
      const result = loadPolicy(json(input));

      assert(Result.isFailure(result));
      assert(
        format(result.failure.issue).issues.some((issue) => isDeepStrictEqual(issue.path, path)),
      );
    }
  });

  it("P04 multiple broken references are reported together instead of silently omitting destinations", () => {
    const result = loadPolicy(
      json({
        ...example,
        routes: { warning: ["missing-warning"], critical: ["missing-critical"] },
      }),
    );

    assert(Result.isFailure(result));
    assert.match(result.failure.message, /Unknown channel: missing-warning/);
    assert.match(result.failure.message, /Unknown channel: missing-critical/);
  });

  it("P05 destination admission rejects malformed URLs, HTTP, and embedded credentials", () => {
    for (const url of [
      "not a URL",
      "http://alerts.example.com/",
      "https://user:secret@alerts.example.com/",
    ]) {
      const result = loadPolicy(
        json({
          ...example,
          channels: [{ _tag: "Webhook", id: "pager", url }],
          routes: { warning: ["pager"], critical: ["pager"] },
        }),
      );

      assert(Result.isFailure(result), url);
    }
  });

  it("P06 empty collections and oversized definitions cannot bypass bounded policy admission", () => {
    for (const input of [
      { ...example, channels: [] },
      {
        ...example,
        channels: Array.from({ length: 9 }, (_, index) => ({
          _tag: "MailingList",
          id: `team-${index}`,
          list: "engineering",
        })),
      },
      { ...example, routes: { ...example.routes, warning: [] } },
      { ...example, maxChannelsPerAlert: 9 },
      { ...example, name: "" },
      { ...example, name: "x".repeat(81) },
      { ...example, channels: [{ _tag: "MailingList", id: "", list: "engineering" }] },
      { ...example, channels: [{ _tag: "MailingList", id: "x".repeat(41), list: "engineering" }] },
      {
        ...example,
        routes: { ...example.routes, warning: Array.from({ length: 9 }, () => "team") },
      },
    ]) {
      assert(Result.isFailure(loadPolicy(json(input))));
    }
  });

  it("P07 encoding and reloading preserve routing meaning and the projected summary excludes destinations", () => {
    const admitted = loadPolicy(json(example));

    assert(Result.isSuccess(admitted));

    const encoded = encodePolicy(admitted.success);
    const summary = encodePolicySummary(admitted.success.summary());

    assert(Result.isSuccess(encoded));
    assert(Result.isSuccess(summary));

    const reloaded = loadPolicy(encoded.success);

    assert(Result.isSuccess(reloaded));
    assert.deepEqual(reloaded.success.preview("critical"), admitted.success.preview("critical"));
    assert.equal(reloaded.success.maxChannelsPerAlert, 4);
    assert.deepEqual(Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(summary.success), {
      name: "Production incident routing",
      maxChannelsPerAlert: 4,
    });
  });

  it.effect("P08 domain construction enforces relationship checks as well as wire admission", () =>
    Effect.gen(function* () {
      const admitted = loadPolicy(json(example));

      assert(Result.isSuccess(admitted));

      const exit = yield* Effect.exit(
        RoutingPolicy.makeEffect({
          name: admitted.success.name,
          maxChannelsPerAlert: 1,
          channels: admitted.success.channels,
          routes: admitted.success.routes,
        }),
      );

      assert(Exit.isFailure(exit));
    }),
  );

  it.effect(
    "G01 two consumer Layers build one gateway and share quota and receipt sequencing",
    () =>
      Effect.gen(function* () {
        const admitted = loadPolicy(json(example));

        assert(Result.isSuccess(admitted));

        yield* Effect.gen(function* () {
          const builds = yield* Ref.make(0);

          // Observe construction without replacing the real gateway or either consumer.
          const observedGateway = Layer.effect(
            DeliveryGateway,
            Effect.gen(function* () {
              const gateway = yield* DeliveryGateway;

              yield* Ref.update(builds, (count) => count + 1);

              return gateway;
            }),
          ).pipe(Layer.provide(DeliveryGateway.layer));

          yield* Effect.gen(function* () {
            const diagnostics = yield* PolicyDiagnostics;
            const notifier = yield* IncidentNotifier;

            const outcomes = yield* Effect.all(
              [
                diagnostics.check(admitted.success),
                notifier.notify(
                  new Incident({ severity: "critical", summary: "Checkout degraded" }),
                ),
              ],
              { concurrency: 2 },
            );

            const sequences = outcomes
              .flat()
              .flatMap(
                DeliveryOutcome.$match({
                  Simulated: ({ sequence }) => [sequence],
                  QuotaReached: () => [],
                }),
              )
              .sort((left, right) => left - right);

            assert.deepEqual(sequences, [1, 2, 3, 4]);
            assert.deepEqual(yield* diagnostics.usage, { accepted: 4, remaining: 0 });

            const refused = yield* notifier.notify(
              new Incident({ severity: "warning", summary: "Follow-up" }),
            );

            assert(refused.every(DeliveryOutcome.$is("QuotaReached")));
            assert.equal(refused.length, 1);
            assert.deepEqual(yield* diagnostics.usage, { accepted: 4, remaining: 0 });
          }).pipe(Effect.provide(makeNotificationApp(admitted.success, observedGateway)));

          assert.equal(yield* Ref.get(builds), 1);
        });
      }),
  );

  it.effect("G02 separate application builds isolate gateway quota", () =>
    Effect.gen(function* () {
      const admitted = loadPolicy(json(example));

      assert(Result.isSuccess(admitted));

      const program = Effect.gen(function* () {
        const notifier = yield* IncidentNotifier;
        const diagnostics = yield* PolicyDiagnostics;

        yield* notifier.notify(new Incident({ severity: "warning", summary: "One alert" }));

        return yield* diagnostics.usage;
      }).pipe(Effect.provide(makeNotificationApp(admitted.success, DeliveryGateway.layer)));

      assert.deepEqual(yield* program, { accepted: 1, remaining: 3 });
      assert.deepEqual(yield* program, { accepted: 1, remaining: 3 });
    }),
  );

  it.effect(
    "G03 Layer.fresh explicitly isolates a consumer from the otherwise shared gateway",
    () =>
      Effect.gen(function* () {
        const admitted = loadPolicy(json(example));

        assert(Result.isSuccess(admitted));

        const separateConsumers = Layer.mergeAll(
          IncidentNotifier.layer(admitted.success).pipe(Layer.provide(DeliveryGateway.layer)),
          PolicyDiagnostics.layer.pipe(Layer.provide(Layer.fresh(DeliveryGateway.layer))),
        );

        yield* Effect.gen(function* () {
          const notifier = yield* IncidentNotifier;
          const diagnostics = yield* PolicyDiagnostics;

          yield* notifier.notify(
            new Incident({ severity: "critical", summary: "Two destinations" }),
          );

          assert.deepEqual(yield* diagnostics.usage, { accepted: 0, remaining: 4 });
        }).pipe(Effect.provide(separateConsumers));
      }),
  );

  it.effect(
    "G04 gateway construction failure remains in the composed application's error channel",
    () =>
      Effect.gen(function* () {
        class GatewayUnavailable extends Data.TaggedError("GatewayUnavailable")<{
          operation: string;
        }> {}

        const admitted = loadPolicy(json(example));

        assert(Result.isSuccess(admitted));

        const failedGateway = Layer.effect(
          DeliveryGateway,
          Effect.fail(new GatewayUnavailable({ operation: "connect" })),
        );

        const result = yield* Effect.result(
          PolicyDiagnostics.use((diagnostics) => diagnostics.usage).pipe(
            Effect.provide(makeNotificationApp(admitted.success, failedGateway)),
          ),
        );

        assert(Result.isFailure(result));
        assert.equal(result.failure._tag, "GatewayUnavailable");
      }),
  );

  it.effect(
    "G05 oversubscribed consumers share four slots and preserve each request's channel and message",
    () =>
      Effect.gen(function* () {
        const admitted = loadPolicy(json(example));

        assert(Result.isSuccess(admitted));

        yield* Effect.gen(function* () {
          const diagnostics = yield* PolicyDiagnostics;
          const notifier = yield* IncidentNotifier;

          const groups = [
            {
              run: diagnostics.check(admitted.success),
              targets: ["team", "pager"],
              message: "Operator channel check",
            },
            {
              run: notifier.notify(
                new Incident({ severity: "critical", summary: "Checkout down" }),
              ),
              targets: ["team", "pager"],
              message: "Checkout down",
            },
            {
              run: notifier.notify(new Incident({ severity: "warning", summary: "Slow checkout" })),
              targets: ["team"],
              message: "Slow checkout",
            },
            {
              run: diagnostics.check(admitted.success),
              targets: ["team", "pager"],
              message: "Operator channel check",
            },
          ];

          const results = yield* Effect.forEach(
            groups,
            (group) =>
              group.run.pipe(
                Effect.map((outcomes) => ({
                  outcomes,
                  targets: group.targets,
                  message: group.message,
                })),
              ),
            { concurrency: 4 },
          );

          const sequences: number[] = [];
          let refused = 0;

          for (const { outcomes, targets, message } of results) {
            assert.deepEqual(
              outcomes.map((outcome) => outcome.channelId),
              targets,
            );

            for (const outcome of outcomes) {
              DeliveryOutcome.$match(outcome, {
                Simulated: (receipt) => {
                  sequences.push(receipt.sequence);
                  assert.equal(receipt.message, message);
                },
                QuotaReached: ({ limit }) => {
                  refused += 1;
                  assert.equal(limit, 4);
                },
              });
            }
          }

          assert.deepEqual(
            sequences.sort((left, right) => left - right),
            [1, 2, 3, 4],
          );
          assert.equal(refused, 3);
          assert.deepEqual(yield* diagnostics.usage, { accepted: 4, remaining: 0 });

          const later = yield* diagnostics.check(admitted.success);

          assert(later.every(DeliveryOutcome.$is("QuotaReached")));
          assert.deepEqual(yield* diagnostics.usage, { accepted: 4, remaining: 0 });
        }).pipe(Effect.provide(makeNotificationApp(admitted.success, DeliveryGateway.layer)));
      }),
  );

  it("P09 changing a preview cannot alter the source policy", () => {
    const admitted = loadPolicy(json(example));

    assert(Result.isSuccess(admitted));

    const webhook = admitted.success
      .preview("critical")
      .channels.find((channel) => channel._tag === "Webhook");

    assert(webhook);
    Object.assign(webhook, { url: "http://changed.example.com" });

    assert.deepEqual(admitted.success.preview("critical").channels, [
      { _tag: "MailingList", id: "team", list: "engineering" },
      { _tag: "Webhook", id: "pager", url: "https://alerts.example.com/incidents" },
    ]);
  });

  it.effect("G06 caller mutation after Layer construction cannot change captured routing", () =>
    Effect.gen(function* () {
      const admitted = loadPolicy(json(example));

      assert(Result.isSuccess(admitted));

      yield* Effect.gen(function* () {
        const notifier = yield* IncidentNotifier;

        Object.assign(admitted.success.routes.warning, { 0: admitted.success.routes.critical[0] });
        Object.assign(admitted.success.channels[0], { id: "changed" });

        const outcomes = yield* notifier.notify(
          new Incident({ severity: "warning", summary: "Still team" }),
        );

        assert.deepEqual(
          outcomes.map((outcome) => ({ ...outcome })),
          [{ _tag: "Simulated", sequence: 1, channelId: "team", message: "Still team" }],
        );
      }).pipe(Effect.provide(makeNotificationApp(admitted.success, DeliveryGateway.layer)));
    }),
  );

  it.effect("G07 Layer construction rejects a policy invalidated before capture", () =>
    Effect.gen(function* () {
      const admitted = loadPolicy(json(example));

      assert(Result.isSuccess(admitted));
      Object.assign(admitted.success.routes.warning, { 0: "missing" });

      const result = yield* IncidentNotifier.pipe(
        Effect.provide(makeNotificationApp(admitted.success, DeliveryGateway.layer)),
        Effect.result,
      );

      assert(Result.isFailure(result));
      assert.equal(result.failure._tag, "Composite");
    }),
  );

  // Test obligation from G-R9: operation admission must precede any shared quota spending.
  it.effect("G08 diagnostics rejects invalid policy without consuming shared quota", () =>
    Effect.gen(function* () {
      const admitted = loadPolicy(json(example));

      assert(Result.isSuccess(admitted));

      const diagnostics = yield* PolicyDiagnostics;

      yield* diagnostics.check(admitted.success);
      assert.deepEqual(yield* diagnostics.usage, { accepted: 2, remaining: 2 });

      // Invalidate a caller-owned value after construction, before the next operation admits it.
      Object.assign(admitted.success.routes.warning, { 0: "missing" });

      const result = yield* Effect.result(diagnostics.check(admitted.success));

      assert(Result.isFailure(result));
      assert.equal(result.failure._tag, "Composite");
      assert.deepEqual(yield* diagnostics.usage, { accepted: 2, remaining: 2 });
    }).pipe(Effect.provide(PolicyDiagnostics.layer.pipe(Layer.provide(DeliveryGateway.layer)))),
  );
});
