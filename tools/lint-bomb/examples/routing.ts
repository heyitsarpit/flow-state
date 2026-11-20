// Run: nub run demo:policy. Verify both examples: nub run check:demo.
// Requirements, boundary invariants, executed checks, and open obligations: ./README.md.
//
// Flow: host -> notification/diagnostics -> policy queries and one shared gateway.
// Concern = responsibility; Boundary = its implementation through a contract.
// Protocol = data with agreed meaning; Established fact = what construction or validation proves.
// Composition level = depth in the call hierarchy, not a folder or required class.
// Requirement = observable behavior; Invariant = a property at named observation points.
// Owner = authority preserving an invariant; Publication = one visible, complete state change.
// Enforcement = the mechanism; Test obligation = a public-boundary check of the guarantee.
// Policy and Incident are independent inputs; admission does not turn policy into an incident.
// Preview describes destinations as data; the gateway records simulated attempts only.
import { NodeRuntime } from "@effect/platform-node";
import {
  Array as Arr,
  Context,
  Data,
  Effect,
  Layer,
  Record as Rec,
  Ref,
  Result,
  Schema,
  SchemaIssue,
  Struct,
  Tuple,
} from "effect";

/*****************************************************************************/
/* Level 2: Policy admission and pure queries */
/*****************************************************************************/

// Concern: establish valid destinations and relationships before consumers select their work.
const ChannelId = Schema.NonEmptyString.check(Schema.isMaxLength(40)).pipe(
  Schema.brand("ChannelId"),
);

type ChannelId = typeof ChannelId.Type;

const Severity = Schema.Literals(["warning", "critical"]);

type Severity = typeof Severity.Type;

// Reuse Schema's URL parser within admission, then retain only the checked string.
// A mutable URL instance could later invalidate the HTTPS fact; the string has no mutable internals.
// This is not an SSRF defense: an eventual sender must own network authorization and redirects.
const decodeUrl = Schema.decodeResult(Schema.URLFromString);

const Destination = Schema.String.check(
  Schema.makeFilter((text) =>
    decodeUrl(text).pipe(
      Result.match({
        onFailure: (error) => error.issue,
        onSuccess: (url) =>
          (url.protocol === "https:" && url.username === "" && url.password === "") ||
          "Webhook destinations require HTTPS and must not contain embedded credentials",
      }),
    ),
  ),
).pipe(Schema.brand("WebhookDestination"));

// Variants require their own fields; one flag plus optional fields would admit invalid combinations.
// Schema also supplies exhaustive matching, so a second Data enum would duplicate this protocol.
const Channel = Schema.TaggedUnion({
  MailingList: { id: ChannelId, list: Schema.Literals(["engineering", "on-call"]) },
  Webhook: { id: ChannelId, url: Destination },
});

// Missing-key defaults are admission policy. Invalid present values must still fail.
// Constructor defaults are intentionally not added: domain construction supplies the required value.
const PolicyFields = Schema.Struct({
  name: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
  maxChannelsPerAlert: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 })).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(4)),
  ),
  channels: Schema.NonEmptyArray(Channel).check(Schema.isMaxLength(8)),
  // A finite-key Record requires a route for every supported severity.
  routes: Schema.Record(Severity, Schema.NonEmptyArray(ChannelId).check(Schema.isMaxLength(8))),
});

// Derive an operator-facing summary from authoritative fields, not a handwritten parallel schema.
// mapFields intentionally drops whole-policy checks: a summary has no routes or references to check.
const PolicySummary = PolicyFields.mapFields(Struct.pick(["name", "maxChannelsPerAlert"]));

export const encodePolicySummary = Schema.encodeResult(Schema.fromJsonString(PolicySummary));

type PolicyDefinition = typeof PolicyFields.Type;

type PolicyIssue = { path: (string | number)[]; issue: string };

// Each named check establishes one relationship. Bounded collections keep these scans small.
const uniqueChannelIds = Schema.makeFilter(
  ({ channels }: PolicyDefinition) =>
    channels.every(
      (channel, index) => channels.findIndex((candidate) => candidate.id === channel.id) === index,
    ) || { path: ["channels"], issue: "Channel IDs must be unique" },
);

const knownRouteTargets = Schema.makeFilter(({ channels, routes }: PolicyDefinition) => {
  const issues: PolicyIssue[] = [];

  for (const [severity, ids] of Rec.toEntries(routes)) {
    for (const [index, id] of ids.entries()) {
      if (!channels.some((channel) => channel.id === id)) {
        issues.push({ path: ["routes", severity, index], issue: `Unknown channel: ${id}` });
      }
    }
  }

  return issues;
});

const uniqueRouteTargets = Schema.makeFilter(({ routes }: PolicyDefinition) => {
  const issues: PolicyIssue[] = [];

  for (const [severity, ids] of Rec.toEntries(routes)) {
    for (const [index, id] of ids.entries()) {
      if (ids.indexOf(id) !== index) {
        issues.push({ path: ["routes", severity, index], issue: `Duplicate route target: ${id}` });
      }
    }
  }

  return issues;
});

const boundedRoutes = Schema.makeFilter(({ routes, maxChannelsPerAlert }: PolicyDefinition) => {
  const issues: PolicyIssue[] = [];

  for (const [severity, ids] of Rec.toEntries(routes)) {
    if (ids.length > maxChannelsPerAlert) {
      issues.push({ path: ["routes", severity], issue: "Route exceeds maxChannelsPerAlert" });
    }
  }

  return issues;
});

// Value invariants: unique IDs, known targets, unique targets, and bounded routes hold after admission.
// Enforcement: named Schema checks reject each invalid relationship with its field-level error path.
const ValidPolicy = PolicyFields.check(
  uniqueChannelIds,
  knownRouteTargets,
  uniqueRouteTargets,
  boundedRoutes,
);

// Protocol: RoutingPolicy carries established facts about fields and relationships at construction.
// Boundary: pure policy queries consume those facts; methods alone do not require a state Owner.
export class RoutingPolicy extends Schema.Class<RoutingPolicy>("policy-demo/RoutingPolicy")(
  ValidPolicy,
) {
  preview(severity: Severity) {
    // Carry established facts: admission proved known, unique targets and bounded routes.
    // Selection uses those relationships directly; it does not validate the policy again.
    const ids = this.routes[severity];

    return {
      policy: this.name,
      severity,
      // Routes are membership sets; delivery preview order follows channel declaration order.
      // Caller-owned policy must remain valid; retaining services use their own validated copy.
      channels: Arr.filter(this.channels, (channel) => ids.includes(channel.id)).map((channel) => ({
        ...channel,
      })),
    };
  }

  summary() {
    return Struct.pick(this, ["name", "maxChannelsPerAlert"]);
  }
}

// Reuse parsers. Both decoding and construction use the same relational checks.
// Accumulate available issues so an operator can repair several configuration errors at once.
export const loadPolicy = Schema.decodeResult(Schema.fromJsonString(RoutingPolicy), {
  onExcessProperty: "error",
  errors: "all",
});

export const encodePolicy = Schema.encodeResult(Schema.fromJsonString(RoutingPolicy));

// Boundary: capturePolicy establishes an owned snapshot before the Service retains it.
// Invariant derived from Requirement G-R8: caller writes cannot change the retained policy.
// Enforcement: copy every retained collection, then validate the copy's relationships.
// Caller-owned fields may change after admission, so their original validation may be stale.
// Revalidation establishes an owned snapshot; consumers then reuse its facts without further checks.
const capturePolicy = (policy: RoutingPolicy) =>
  RoutingPolicy.makeEffect({
    name: policy.name,
    maxChannelsPerAlert: policy.maxChannelsPerAlert,
    channels: Arr.map(policy.channels, (channel) => ({ ...channel })),
    routes: Rec.map(policy.routes, (ids) => Arr.map(ids, (id) => id)),
  });

/*****************************************************************************/
/* Level 2: Delivery protocols and shared capability */
/*****************************************************************************/

// Protocols are shared across levels: consumers pass channel IDs and return DeliveryOutcome unchanged.
// TRUSTED DATA: incidents originate inside the application; Data supplies value constructors.
// These constructors do not validate unknown input. An HTTP incident endpoint would need Schema.
export class Incident extends Data.Class<{ severity: Severity; summary: string }> {}

export type DeliveryOutcome = Data.TaggedEnum<{
  Simulated: { sequence: number; channelId: ChannelId; message: string };
  QuotaReached: { channelId: ChannelId; limit: number };
}>;

export const DeliveryOutcome = Data.taggedEnum<DeliveryOutcome>();

// The quota is a bound, not a phase: one named limit, read wherever the count is judged.
const attemptQuota = 4;

// This pure transition returns the Ref result and next count together; nothing is sent remotely.
const simulateAttempt = (count: number, channelId: ChannelId, message: string) => {
  if (count >= attemptQuota) {
    return Tuple.make(DeliveryOutcome.QuotaReached({ channelId, limit: attemptQuota }), count);
  }

  return Tuple.make(
    DeliveryOutcome.Simulated({ sequence: count + 1, channelId, message }),
    count + 1,
  );
};

// SHARED OWNER: one atomic count owns both the four-attempt quota and unique sequence numbers.
// Rejected attempts do not increment. The fixed bound also prevents counter overflow.
// The sandbox retains no history and promises neither durable delivery nor idempotent retries.
export class DeliveryGateway extends Context.Service<
  DeliveryGateway,
  {
    record: (channelId: ChannelId, message: string) => Effect.Effect<DeliveryOutcome>;
    usage: Effect.Effect<{ accepted: number; remaining: number }>;
  }
>()("lint-bomb/examples/routing/DeliveryGateway") {
  static layer = Layer.effect(
    DeliveryGateway,
    Effect.gen(function* () {
      const accepted = yield* Ref.make(0);

      const record = (channelId: ChannelId, message: string) =>
        Ref.modify<number, DeliveryOutcome>(accepted, (count) =>
          simulateAttempt(count, channelId, message),
        );

      const usage = Ref.get(accepted).pipe(
        Effect.map((count) => ({ accepted: count, remaining: attemptQuota - count })),
      );

      return DeliveryGateway.of({ record, usage });
    }),
  );
}

/*****************************************************************************/
/* Level 1: Consumer workflows */
/*****************************************************************************/

// Composition site: each consumer selects work, then calls the same gateway capability.
// Gateway internals stay hidden; consumer policy and concurrency remain visible here.
// CONSUMER A: capture stable application policy and gateway at construction.
// notify only requires IncidentNotifier; gateway wiring stays private. Each incident is an argument.
export class IncidentNotifier extends Context.Service<
  IncidentNotifier,
  {
    notify: (incident: Incident) => Effect.Effect<DeliveryOutcome[]>;
  }
>()("lint-bomb/examples/routing/IncidentNotifier") {
  static layer = (policy: RoutingPolicy) =>
    Layer.effect(
      IncidentNotifier,
      Effect.gen(function* () {
        const gateway = yield* DeliveryGateway;
        const captured = yield* capturePolicy(policy);

        const notify = Effect.fn("IncidentNotifier.notify")(function* (incident: Incident) {
          return yield* Effect.forEach(
            captured.preview(incident.severity).channels,
            (channel) => gateway.record(channel.id, incident.summary),
            { concurrency: 2 },
          );
        });

        return IncidentNotifier.of({ notify });
      }),
    );
}

// CONSUMER B: diagnostics exercises all configured channels, even those outside one incident's route.
// Its policy is operation input, unlike the notifier's fixed application policy.
// Capturing the same gateway makes diagnostics consume the same quota as incident notifications.
export class PolicyDiagnostics extends Context.Service<
  PolicyDiagnostics,
  {
    check: (policy: RoutingPolicy) => Effect.Effect<DeliveryOutcome[], SchemaIssue.Issue>;
    usage: Effect.Effect<{ accepted: number; remaining: number }>;
  }
>()("lint-bomb/examples/routing/PolicyDiagnostics") {
  static layer = Layer.effect(
    PolicyDiagnostics,
    Effect.gen(function* () {
      const gateway = yield* DeliveryGateway;

      const check = Effect.fn("PolicyDiagnostics.check")(function* (policy: RoutingPolicy) {
        const captured = yield* capturePolicy(policy);

        return yield* Effect.forEach(
          captured.channels,
          (channel) => gateway.record(channel.id, "Operator channel check"),
          { concurrency: 2 },
        );
      });

      return PolicyDiagnostics.of({ check, usage: gateway.usage });
    }),
  );
}

/*****************************************************************************/
/* Level 0: Application assembly and host */
/*****************************************************************************/

// Composition site: choose the gateway implementation and which consumers share its state.
// LAYER DIAMOND: two independent consumer Layers depend on one identical gateway Layer value.
//
// IncidentNotifier.layer(policy) --\
//                                  >-- shared gateway
// PolicyDiagnostics.layer --------/
//
// provide hides each implementation dependency; mergeAll exposes both consumer capabilities.
// Layer memoization shares the identical gateway Layer within this build, including its private Ref.
// New Layer builds get new state. Layer.fresh(gateway) on one branch would deliberately stop sharing.
// Policy capture can fail; the supplied gateway retains its own construction errors and requirements.
export const makeNotificationApp = <E, R>(
  policy: RoutingPolicy,
  gateway: Layer.Layer<DeliveryGateway, E, R>,
) =>
  Layer.mergeAll(
    IncidentNotifier.layer(policy).pipe(Layer.provide(gateway)),
    PolicyDiagnostics.layer.pipe(Layer.provide(gateway)),
  );

// The host presents schema-owned channel variants and trusted runtime outcomes separately.
const describeChannel = Channel.match({
  MailingList: ({ id, list }) => `${id}: mailing list ${list}`,
  Webhook: ({ id, url }) => `${id}: webhook ${url}`,
});

const describeOutcome = DeliveryOutcome.$match({
  Simulated: ({ sequence, channelId, message }) =>
    `Sandbox #${sequence} -> ${channelId}: ${message}`,
  QuotaReached: ({ channelId, limit }) => `${channelId}: shared quota of ${limit} exhausted`,
});

export const runPolicyDemo = Effect.gen(function* () {
  const policy = yield* Effect.fromResult(
    loadPolicy(`{
    "name": "Production incident routing",
    "channels": [
      { "_tag": "MailingList", "id": "team", "list": "engineering" },
      { "_tag": "Webhook", "id": "pager", "url": "https://alerts.example.com/incidents" }
    ],
    "routes": { "warning": ["team"], "critical": ["team", "pager"] }
  }`),
  );

  const summary = yield* Effect.fromResult(encodePolicySummary(policy.summary()));

  yield* Effect.logInfo(`Admitted policy: ${summary}`);

  for (const channel of policy.channels) {
    yield* Effect.logInfo(describeChannel(channel));
  }

  yield* Effect.gen(function* () {
    const diagnostics = yield* PolicyDiagnostics;
    const notifier = yield* IncidentNotifier;
    const checks = yield* diagnostics.check(policy);

    const notifications = yield* notifier.notify(
      new Incident({
        severity: "critical",
        summary: "Checkout error rate exceeded its threshold",
      }),
    );

    for (const outcome of [...checks, ...notifications]) {
      yield* Effect.logInfo(describeOutcome(outcome));
    }

    // Both consumers already used the four slots; another incident observes the shared limit.
    const exhausted = yield* notifier.notify(
      new Incident({ severity: "warning", summary: "Follow-up" }),
    );

    for (const outcome of exhausted) {
      yield* Effect.logInfo(describeOutcome(outcome));
    }

    yield* Effect.logInfo(yield* diagnostics.usage);
  }).pipe(Effect.provide(makeNotificationApp(policy, DeliveryGateway.layer)));
});

// The host runs one graph. Services never create their own runtime or rebuild dependencies per call.
if (import.meta.main) {
  NodeRuntime.runMain(runPolicyDemo);
}
