import { Schema } from "effect";

import type { FlowConcurrencyPolicy, FlowTestPendingWork } from "./core/api/types.js";

export const FlowDiagnosticCodes = Object.freeze({
  invalidModuleEntry: "FLOW-APP-001",
  invalidModuleFixture: "FLOW-APP-002",
  undeclaredModuleFixture: "FLOW-APP-003",
  missingModuleFixture: "FLOW-APP-004",
  duplicateModuleId: "FLOW-APP-005",
  duplicateDescriptorId: "FLOW-APP-006",
  unknownModuleFixture: "FLOW-APP-007",
  invalidInspectionRetention: "FLOW-INSPECT-001",
  duplicateActorId: "FLOW-ORCH-001",
  invalidRuntimeBootPayloadVersion: "FLOW-RUNTIME-001",
  missingResourceRuntimeDetails: "FLOW-STORE-001",
  resourceCallbackThrew: "FLOW-STORE-002",
  rejectedWhileRunningTransaction: "FLOW-TXN-001",
  transactionCallbackThrew: "FLOW-TXN-002",
  transactionOutcomeCallbackThrew: "FLOW-TXN-003",
  machineCallbackThrew: "FLOW-MACHINE-001",
  streamCallbackThrew: "FLOW-STREAM-001",
  coalescedStreamPressure: "FLOW-STREAM-002",
  viewSelectThrew: "FLOW-VIEW-001",
  missingProviderRuntime: "FLOW-REACT-001",
  settleBoundsMaxFibers: "FLOW-TEST-001",
  settleBoundsMaxTicks: "FLOW-TEST-002",
} as const);

const flowDiagnosticCodeValues = [
  FlowDiagnosticCodes.invalidModuleEntry,
  FlowDiagnosticCodes.invalidModuleFixture,
  FlowDiagnosticCodes.undeclaredModuleFixture,
  FlowDiagnosticCodes.missingModuleFixture,
  FlowDiagnosticCodes.duplicateModuleId,
  FlowDiagnosticCodes.duplicateDescriptorId,
  FlowDiagnosticCodes.unknownModuleFixture,
  FlowDiagnosticCodes.invalidInspectionRetention,
  FlowDiagnosticCodes.duplicateActorId,
  FlowDiagnosticCodes.invalidRuntimeBootPayloadVersion,
  FlowDiagnosticCodes.missingResourceRuntimeDetails,
  FlowDiagnosticCodes.resourceCallbackThrew,
  FlowDiagnosticCodes.rejectedWhileRunningTransaction,
  FlowDiagnosticCodes.transactionCallbackThrew,
  FlowDiagnosticCodes.transactionOutcomeCallbackThrew,
  FlowDiagnosticCodes.machineCallbackThrew,
  FlowDiagnosticCodes.streamCallbackThrew,
  FlowDiagnosticCodes.coalescedStreamPressure,
  FlowDiagnosticCodes.viewSelectThrew,
  FlowDiagnosticCodes.missingProviderRuntime,
  FlowDiagnosticCodes.settleBoundsMaxFibers,
  FlowDiagnosticCodes.settleBoundsMaxTicks,
] as const;

export type FlowDiagnosticCode = (typeof flowDiagnosticCodeValues)[number];

export const FlowBugCodes = Object.freeze({
  missingOwnedChildActor: "bug[flow-orch/missing-owned-child-actor]",
} as const);

const flowBugCodeValues = [FlowBugCodes.missingOwnedChildActor] as const;

export type FlowBugCode = (typeof flowBugCodeValues)[number];

const FlowDiagnosticCodeSchema = Schema.Literals(flowDiagnosticCodeValues);
const FlowBugCodeSchema = Schema.Literals(flowBugCodeValues);

const flowDiagnosticDetailFields = {
  title: Schema.String,
  summary: Schema.String,
  why: Schema.String,
  help: Schema.String,
  debug: Schema.Record(Schema.String, Schema.Json),
} as const;

export const FlowDiagnosticDocument = Schema.Struct({
  code: FlowDiagnosticCodeSchema,
  ...flowDiagnosticDetailFields,
});

export type FlowDiagnosticDocument = typeof FlowDiagnosticDocument.Type;

export const FlowBugDocument = Schema.Struct({
  code: FlowBugCodeSchema,
  ...flowDiagnosticDetailFields,
});

export type FlowBugDocument = typeof FlowBugDocument.Type;

export const AnyFlowDiagnosticDocument = Schema.Union([FlowDiagnosticDocument, FlowBugDocument]);

export type AnyFlowDiagnosticDocument = typeof AnyFlowDiagnosticDocument.Type;

export type FlowDiagnosticPrinter = (document: AnyFlowDiagnosticDocument) => string;

const encodeDiagnosticDefect = Schema.encodeSync(Schema.Defect({ includeStack: true }));

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJson(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJson(entryValue)]),
    );
  }

  return value;
}

function formatDebug(debug: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(sortJson(debug));
}

const compactFlowDiagnosticPrinter: FlowDiagnosticPrinter = (document) =>
  [
    `[${document.code}] ${document.title}`,
    `what happened: ${document.summary}`,
    `why: ${document.why}`,
    `help: ${document.help}`,
    `debug: ${formatDebug(document.debug)}`,
  ].join("\n");

const prettyFlowDiagnosticPrinter: FlowDiagnosticPrinter = (document) =>
  [
    `${document.code} ${document.title}`,
    "",
    "What happened",
    `  ${document.summary}`,
    "",
    "Why",
    `  ${document.why}`,
    "",
    "Help",
    `  ${document.help}`,
    "",
    "Debug",
    `  ${formatDebug(document.debug)}`,
  ].join("\n");

export function isFlowDiagnostic(error: unknown): error is FlowDiagnostic {
  return error instanceof FlowDiagnostic;
}

export function isFlowBug(error: unknown): error is FlowBug {
  return error instanceof FlowBug;
}

export function flowDiagnosticDocumentOf(diagnostic: FlowDiagnostic): FlowDiagnosticDocument;
export function flowDiagnosticDocumentOf(diagnostic: FlowBug): FlowBugDocument;
export function flowDiagnosticDocumentOf(
  diagnostic: AnyFlowDiagnosticDocument,
): AnyFlowDiagnosticDocument;
export function flowDiagnosticDocumentOf(
  diagnostic: FlowDiagnostic | FlowBug | AnyFlowDiagnosticDocument,
): AnyFlowDiagnosticDocument {
  if (isFlowDiagnostic(diagnostic) || isFlowBug(diagnostic)) {
    return {
      code: diagnostic.code,
      title: diagnostic.title,
      summary: diagnostic.summary,
      why: diagnostic.why,
      help: diagnostic.help,
      debug: diagnostic.debug,
    };
  }

  return diagnostic;
}

export function printFlowDiagnostic(
  diagnostic: FlowDiagnostic | FlowBug | AnyFlowDiagnosticDocument,
  printer: FlowDiagnosticPrinter = compactFlowDiagnosticPrinter,
): string {
  return printer(flowDiagnosticDocumentOf(diagnostic));
}

export function formatFlowDiagnostic(
  diagnostic: FlowDiagnostic | FlowBug | AnyFlowDiagnosticDocument,
): string {
  return printFlowDiagnostic(diagnostic, compactFlowDiagnosticPrinter);
}

export function formatFlowDiagnosticPretty(
  diagnostic: FlowDiagnostic | FlowBug | AnyFlowDiagnosticDocument,
): string {
  return printFlowDiagnostic(diagnostic, prettyFlowDiagnosticPrinter);
}

export class FlowDiagnostic extends Schema.TaggedErrorClass<FlowDiagnostic>(
  "@flow-state/core/FlowDiagnostic",
)("FlowDiagnostic", {
  code: FlowDiagnosticCodeSchema,
  ...flowDiagnosticDetailFields,
}) {
  constructor(document: FlowDiagnosticDocument) {
    super(document);
    installLazyFlowDiagnosticMessage(this);
  }

  override toString(): string {
    return this.message;
  }
}

export class FlowBug extends Schema.TaggedErrorClass<FlowBug>("@flow-state/core/FlowBug")(
  "FlowBug",
  {
    code: FlowBugCodeSchema,
    ...flowDiagnosticDetailFields,
  },
) {
  constructor(document: FlowBugDocument) {
    super(document);
    installLazyFlowDiagnosticMessage(this);
  }

  override toString(): string {
    return this.message;
  }
}

function attachDiagnosticCause<T extends FlowDiagnostic | FlowBug>(
  diagnostic: T,
  cause: unknown,
): T {
  Object.defineProperty(diagnostic, "cause", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: cause,
  });
  return diagnostic;
}

function installLazyFlowDiagnosticMessage(target: FlowDiagnostic | FlowBug): void {
  let cachedMessage: string | undefined;

  Object.defineProperty(target, "message", {
    configurable: true,
    enumerable: false,
    get() {
      cachedMessage ??= printFlowDiagnostic(target);
      return cachedMessage;
    },
    set(value: string) {
      cachedMessage = value;
    },
  });
}

export function invalidFlowModuleEntryDiagnostic(args: {
  readonly moduleId: string;
  readonly section: string;
  readonly entryName: string;
  readonly kind: string;
}): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.invalidModuleEntry,
    title: `Invalid flow module ${args.kind} entry: ${args.moduleId}.${args.section}.${args.entryName}`,
    summary: `Module '${args.moduleId}' exposes '${args.entryName}' in '${args.section}', but it is not a flow.${args.kind}(...) descriptor.`,
    why: `Inventory validation only accepts values created by flow.${args.kind}(...).`,
    help: `Replace '${args.entryName}' with flow.${args.kind}(...) or remove it from '${args.section}'.`,
    debug: {
      moduleId: args.moduleId,
      section: args.section,
      entryName: args.entryName,
      kind: args.kind,
    },
  });
}

export function invalidFlowModuleFixtureDiagnostic(
  moduleId: string,
  fixtureName: string,
): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.invalidModuleFixture,
    title: `Invalid flow module fixture: ${moduleId}.fixtures.${fixtureName}`,
    summary: `Fixture '${moduleId}.fixtures.${fixtureName}' is not a valid seeded resource array.`,
    why: "Fixture seeding only accepts arrays of { ref, value } entries built from Flow resource refs.",
    help: `Use resource.ref(...) values in '${moduleId}.fixtures.${fixtureName}' or remove it.`,
    debug: {
      moduleId,
      fixtureName,
    },
  });
}

export function undeclaredFlowModuleFixtureDiagnostic(
  moduleId: string,
  fixtureName: string,
): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.undeclaredModuleFixture,
    title: `Undeclared flow module fixture: ${moduleId}.fixtures.${fixtureName}`,
    summary: `Module '${moduleId}' exposes fixture '${fixtureName}' but does not declare it in meta.fixtures.`,
    why: "Fixture registries and declared fixture names must stay aligned.",
    help: `Add '${fixtureName}' to ${moduleId}'s meta.fixtures or remove '${moduleId}.fixtures.${fixtureName}'.`,
    debug: {
      moduleId,
      fixtureName,
    },
  });
}

export function missingFlowModuleFixtureDiagnostic(
  moduleId: string,
  fixtureName: string,
): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.missingModuleFixture,
    title: `Missing flow module fixture: ${moduleId}.fixtures.${fixtureName}`,
    summary: `Module '${moduleId}' declared fixture '${fixtureName}' but did not provide a registry entry.`,
    why: "Declared fixture names are executable inventory and must map to seeded resources.",
    help: `Add '${moduleId}.fixtures.${fixtureName}' or remove '${fixtureName}' from ${moduleId}'s meta.fixtures.`,
    debug: {
      moduleId,
      fixtureName,
    },
  });
}

export function duplicateFlowModuleIdDiagnostic(moduleId: string): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.duplicateModuleId,
    title: `Duplicate flow module id: ${moduleId}`,
    summary: `flow.app(...) received duplicate '${moduleId}' modules.`,
    why: "Module ids must be unique so module maps and inventory stay stable.",
    help: `Rename one module or reuse the same module definition.`,
    debug: {
      moduleId,
    },
  });
}

export function duplicateFlowDescriptorIdDiagnostic(args: {
  readonly kind: string;
  readonly descriptorId: string;
}): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.duplicateDescriptorId,
    title: `Duplicate flow ${args.kind} id: ${args.descriptorId}`,
    summary: `Two distinct ${args.kind} descriptors resolved to '${args.descriptorId}'.`,
    why: "Descriptor ids must be unique unless modules share the same descriptor instance.",
    help: `Give each ${args.kind} a unique id or reuse the same descriptor object.`,
    debug: {
      kind: args.kind,
      descriptorId: args.descriptorId,
    },
  });
}

export function unknownFlowModuleFixtureDiagnostic(fixtureName: string): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.unknownModuleFixture,
    title: `Unknown flow module fixture: ${fixtureName}`,
    summary: `test.app(...).scenario(...).with({ fixtures: ['${fixtureName}'] }) could not find that fixture.`,
    why: "Fixture seeding resolves against declared module fixture inventory.",
    help: `Declare '${fixtureName}' in meta.fixtures and provide a matching registry entry.`,
    debug: {
      fixtureName,
    },
  });
}

export function duplicateFlowActorIdDiagnostic(actorId: string, machineId: string): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.duplicateActorId,
    title: `Actor with id '${actorId}' already exists`,
    summary: `OrchestratorSystem.start tried to register '${actorId}' while another live actor still owned it.`,
    why: "Actor ids must stay unique within a runtime so subscriptions and routing stay deterministic.",
    help: `Pass a unique start({ id }) or stop the actor first.`,
    debug: {
      actorId,
      machineId,
    },
  });
}

export function invalidInspectionRetentionDiagnostic(args: {
  readonly field: "maxAge" | "maxEvents";
  readonly reason: string;
}): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.invalidInspectionRetention,
    title: `Invalid inspection retention field '${args.field}'`,
    summary: `Flow received an inspection retention policy whose '${args.field}' value is not supported.`,
    why: "Inspection retention has to be validated up front so the runtime can prune entries deterministically instead of guessing how to recover from malformed policy input.",
    help: "Pass a non-negative integer for maxEvents and a finite non-negative Duration.Input for maxAge.",
    debug: {
      field: args.field,
      reason: args.reason,
    },
  });
}

export function missingResourceRuntimeDetailsDiagnostic(refId: string): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.missingResourceRuntimeDetails,
    title: `Missing resource runtime details for ${refId}`,
    summary: `ResourceStore received ref '${refId}' without lookup or freshness metadata.`,
    why: "Flow expects resource refs to come from flow.resource(...).ref(...).",
    help: `Create refs through .ref(...) and avoid hand-written or serialized copies.`,
    debug: {
      refId,
    },
  });
}

export function invalidRuntimeBootPayloadVersionDiagnostic(args: {
  readonly expectedVersion: string;
  readonly receivedVersion: string;
}): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.invalidRuntimeBootPayloadVersion,
    title: `Unsupported runtime boot payload version '${args.receivedVersion}'`,
    summary:
      "Flow tried to hydrate a runtime boot payload whose version tag does not match the supported runtime boot format.",
    why: "Runtime boot payloads are versioned so incompatible resource and actor snapshot formats fail closed instead of restoring partial state.",
    help: "Dehydrate again with a matching Flow State runtime version before hydrating this payload.",
    debug: {
      expectedVersion: args.expectedVersion,
      receivedVersion: args.receivedVersion,
    },
  });
}

export function resourceCallbackThrewDiagnostic(args: {
  readonly resourceId: string;
  readonly callback: "lookup" | "tags" | "placeholder" | "key";
  readonly cause: unknown;
}): FlowDiagnostic {
  return attachDiagnosticCause(
    new FlowDiagnostic({
      code: FlowDiagnosticCodes.resourceCallbackThrew,
      title: `Resource callback '${args.callback}' threw for '${args.resourceId}'`,
      summary: `Flow called '${args.callback}' for resource '${args.resourceId}', and it threw during ref creation.`,
      why: "Resource ref callbacks run synchronously while Flow builds ref metadata.",
      help: "Return ref metadata instead of throwing. Fail lookup work inside the returned Effect.",
      debug: {
        resourceId: args.resourceId,
        callback: args.callback,
        cause: encodeDiagnosticDefect(args.cause),
      },
    }),
    args.cause,
  );
}

export function rejectedWhileRunningTransactionDiagnostic(args: {
  readonly transactionId: string;
  readonly concurrency: FlowConcurrencyPolicy;
  readonly parentState: string;
  readonly activeAttemptCount: number;
}): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.rejectedWhileRunningTransaction,
    title: `Transaction '${args.transactionId}' was rejected while another attempt was running`,
    summary: `Flow tried to start '${args.transactionId}' while another ${args.concurrency} attempt was still active.`,
    why: `The policy kept the active attempt instead of queueing, canceling, or allowing overlap.`,
    help: `Wait for '${args.transactionId}' to settle, guard the trigger, or switch concurrency.`,
    debug: {
      transactionId: args.transactionId,
      concurrency: args.concurrency,
      parentState: args.parentState,
      activeAttemptCount: args.activeAttemptCount,
    },
  });
}

export function transactionCallbackThrewDiagnostic(args: {
  readonly transactionId: string;
  readonly callback: "params" | "preview.apply" | "invalidates" | "commit";
  readonly cause: unknown;
}): FlowDiagnostic {
  return attachDiagnosticCause(
    new FlowDiagnostic({
      code: FlowDiagnosticCodes.transactionCallbackThrew,
      title: `Transaction callback '${args.callback}' threw for '${args.transactionId}'`,
      summary: `Flow called '${args.callback}' for transaction '${args.transactionId}', and it threw before the work settled.`,
      why: "Transaction callbacks run synchronously while Flow resolves params, previews, invalidations, and commit Effects.",
      help: "Return values instead of throwing. Fail commit work inside the returned Effect or die.",
      debug: {
        transactionId: args.transactionId,
        callback: args.callback,
        cause: encodeDiagnosticDefect(args.cause),
      },
    }),
    args.cause,
  );
}

export function transactionOutcomeCallbackThrewDiagnostic(args: {
  readonly transactionId: string;
  readonly callback: "routes.success" | "routes.failure" | "routes.defect" | "routes.interrupt";
  readonly cause: unknown;
}): FlowDiagnostic {
  return attachDiagnosticCause(
    new FlowDiagnostic({
      code: FlowDiagnosticCodes.transactionOutcomeCallbackThrew,
      title: `Transaction outcome callback '${args.callback}' threw for '${args.transactionId}'`,
      summary: `Flow called '${args.callback}' for transaction '${args.transactionId}', and the route threw before it returned an event.`,
      why: "Outcome routes run synchronously while Flow maps completion lanes into machine events.",
      help: "Return an event instead of throwing. Put richer handling behind that event.",
      debug: {
        transactionId: args.transactionId,
        callback: args.callback,
        cause: encodeDiagnosticDefect(args.cause),
      },
    }),
    args.cause,
  );
}

export function machineCallbackThrewDiagnostic(args: {
  readonly machineId: string;
  readonly callback: "context" | "update" | "actions.transition" | "actions.entry" | "actions.exit";
  readonly eventType?: string;
  readonly state?: string;
  readonly trigger?: "event" | "always" | "after";
  readonly step?: number;
  readonly cause: unknown;
}): FlowDiagnostic {
  const detail =
    args.callback === "context"
      ? {
          title: `Machine callback 'context' threw for '${args.machineId}'`,
          summary: `Flow called 'context' for machine '${args.machineId}', and it threw during snapshot creation.`,
          why: "Machine context factories run synchronously when Flow creates snapshots.",
          help: "Return context instead of throwing. Load outside data after startup.",
          debug: {
            machineId: args.machineId,
            callback: args.callback,
            cause: encodeDiagnosticDefect(args.cause),
          },
        }
      : {
          title: `Machine callback '${args.callback}' threw for '${args.machineId}'`,
          summary: `Flow called '${args.callback}' for machine '${args.machineId}' on '${args.eventType}', and it threw during the microstep.`,
          why: "Machine update and action callbacks run synchronously during microsteps.",
          help: "Return context patches or receipts instead of throwing. Use guards or events to communicate work.",
          debug: {
            machineId: args.machineId,
            callback: args.callback,
            eventType: args.eventType,
            state: args.state,
            trigger: args.trigger,
            step: args.step,
            cause: encodeDiagnosticDefect(args.cause),
          },
        };
  return attachDiagnosticCause(
    new FlowDiagnostic({
      code: FlowDiagnosticCodes.machineCallbackThrew,
      ...detail,
    } as FlowDiagnosticDocument),
    args.cause,
  );
}

export function streamCallbackThrewDiagnostic(args: {
  readonly streamId: string;
  readonly callback:
    | "params"
    | "subscribe"
    | "pressure.key"
    | "routes.value"
    | "routes.done"
    | "routes.failure"
    | "routes.defect"
    | "routes.interrupt";
  readonly cause: unknown;
}): FlowDiagnostic {
  return attachDiagnosticCause(
    new FlowDiagnostic({
      code: FlowDiagnosticCodes.streamCallbackThrew,
      title: `Stream callback '${args.callback}' threw for '${args.streamId}'`,
      summary: `Flow called '${args.callback}' for stream '${args.streamId}', and it threw during stream resolution.`,
      why: "Stream callbacks run synchronously while Flow resolves params, subscriptions, pressure keys, and routes.",
      help: "Return values instead of throwing. Fail stream work inside the returned Stream.",
      debug: {
        streamId: args.streamId,
        callback: args.callback,
        cause: encodeDiagnosticDefect(args.cause),
      },
    }),
    args.cause,
  );
}

export function viewSelectThrewDiagnostic(args: {
  readonly viewId: string;
  readonly callback: "select";
  readonly cause: unknown;
}): FlowDiagnostic {
  return attachDiagnosticCause(
    new FlowDiagnostic({
      code: FlowDiagnosticCodes.viewSelectThrew,
      title: `View callback '${args.callback}' threw for '${args.viewId}'`,
      summary: `Flow called 'select' for view '${args.viewId}', and it threw before returning a value.`,
      why: "View projections run synchronously when Flow derives read models from snapshots and issues.",
      help: "Return derived data instead of throwing. Encode fallbacks in the view model.",
      debug: {
        viewId: args.viewId,
        callback: args.callback,
        cause: encodeDiagnosticDefect(args.cause),
      },
    }),
    args.cause,
  );
}

export function settleBoundsDiagnostic(
  kind: "maxFibers" | "maxTicks",
  bounds: Readonly<{
    readonly maxTicks: number;
    readonly maxFibers: number;
  }>,
  pending: FlowTestPendingWork,
): FlowDiagnostic {
  return testControlBoundsDiagnostic({
    method: "settle",
    kind,
    bounds,
    pending,
  });
}

export function testControlBoundsDiagnostic(args: {
  readonly method:
    | "settle"
    | "advanceUntilIdle"
    | "until"
    | "untilState"
    | "untilReceipt"
    | "untilIssue";
  readonly kind: "maxFibers" | "maxTicks";
  readonly bounds: Readonly<{
    readonly maxTicks: number;
    readonly maxFibers: number;
  }>;
  readonly pending: FlowTestPendingWork;
  readonly awaiting?: string;
}): FlowDiagnostic {
  const targetSummary = args.awaiting === undefined ? "" : ` while waiting for ${args.awaiting}`;
  const pending = args.pending;

  return new FlowDiagnostic({
    code:
      args.kind === "maxFibers"
        ? FlowDiagnosticCodes.settleBoundsMaxFibers
        : FlowDiagnosticCodes.settleBoundsMaxTicks,
    title: `flowTest.${args.method} exceeded ${args.kind} with maxTicks=${args.bounds.maxTicks} and maxFibers=${args.bounds.maxFibers}`,
    summary:
      args.method === "settle"
        ? `flowTest.settle could not reach a quiescent harness before the ${args.kind} bound was exceeded.`
        : `flowTest.${args.method} could not finish${targetSummary} before the ${args.kind} bound was exceeded.`,
    why:
      args.method === "settle"
        ? "The harness still owned pending work after a flush turn, so the settle loop stopped instead of hiding live fibers."
        : "The harness still owned pending work after a progress turn, so the wait loop stopped instead of pretending the awaited fact had arrived.",
    help:
      args.method === "settle"
        ? "Increase the settle bounds if the background work is intentional, or inspect the pending timers, streams, transactions, mailboxes, and children."
        : "Increase the wait bounds if the background work is intentional, or inspect the pending timers, streams, transactions, mailboxes, and children to see why progress stalled.",
    debug: {
      bounds: args.bounds,
      ...(args.awaiting === undefined ? {} : { awaiting: args.awaiting }),
      ready: pending.ready,
      activeFibers: pending.activeFibers,
      mailboxes: pending.mailboxes,
      transactions: pending.transactions,
      streams: pending.streams,
      timers: pending.timers,
      children: pending.children,
      ...(pending.nextAfterMillis === undefined
        ? {}
        : { nextAfterMillis: pending.nextAfterMillis }),
    },
  });
}

export function missingOwnedChildActorBug(childId: string): FlowBug {
  return new FlowBug({
    code: FlowBugCodes.missingOwnedChildActor,
    title: `Missing owned child actor for ${childId}`,
    summary:
      "The orchestrator expected a previously attached owned child actor to still be registered.",
    why: "The runtime reached a state that should be impossible once child attachment succeeds and state-owned child bookkeeping stays consistent.",
    help: "Treat this as a library bug and inspect recent child:start and child:stop facts for the parent actor before filing or fixing the issue.",
    debug: {
      childId,
    },
  });
}
