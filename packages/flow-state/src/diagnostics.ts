import { Schema } from "effect";

import type { FlowConcurrencyPolicy, FlowTestPendingWork } from "./public/types.js";

export const FlowDiagnosticCodes = Object.freeze({
  invalidModuleEntry: "FLOW-APP-001",
  invalidModuleFixture: "FLOW-APP-002",
  undeclaredModuleFixture: "FLOW-APP-003",
  missingModuleFixture: "FLOW-APP-004",
  duplicateModuleId: "FLOW-APP-005",
  duplicateDescriptorId: "FLOW-APP-006",
  unknownModuleFixture: "FLOW-APP-007",
  duplicateActorId: "FLOW-ORCH-001",
  missingResourceRuntimeDetails: "FLOW-STORE-001",
  rejectedWhileRunningTransaction: "FLOW-TXN-001",
  transactionCallbackThrew: "FLOW-TXN-002",
  transactionOutcomeCallbackThrew: "FLOW-TXN-003",
  streamCallbackThrew: "FLOW-STREAM-001",
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
  FlowDiagnosticCodes.duplicateActorId,
  FlowDiagnosticCodes.missingResourceRuntimeDetails,
  FlowDiagnosticCodes.rejectedWhileRunningTransaction,
  FlowDiagnosticCodes.transactionCallbackThrew,
  FlowDiagnosticCodes.transactionOutcomeCallbackThrew,
  FlowDiagnosticCodes.streamCallbackThrew,
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

export function missingFlowProviderRuntimeDiagnostic(): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.missingProviderRuntime,
    title: "FlowProvider is missing a runtime",
    summary: "useFlowRuntime() was called outside a FlowProvider boundary.",
    why: "FlowRuntimeContext resolved to null for the current React subtree.",
    help: "Wrap the subtree in <FlowProvider runtime={...}> or move the hook under an existing provider.",
    debug: {
      hook: "useFlowRuntime",
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
    summary: `Flow module '${args.moduleId}' exposes '${args.entryName}' in '${args.section}', but that value is not a supported ${args.kind} descriptor.`,
    why: `Descriptor inventory validation only accepts values created by flow.${args.kind}(...) in the '${args.section}' section.`,
    help: `Replace '${args.moduleId}.${args.section}.${args.entryName}' with a descriptor created by flow.${args.kind}(...) or remove it from the module inventory.`,
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
    summary: `Flow module fixture '${moduleId}.fixtures.${fixtureName}' is not a valid array of seeded resource entries.`,
    why: "Fixture seeding only accepts read-only arrays of { ref, value } entries built from Flow resource refs.",
    help: `Use resource.ref(...) values in '${moduleId}.fixtures.${fixtureName}' or remove the malformed fixture entry.`,
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
    summary: `Flow module '${moduleId}' exposes fixture '${fixtureName}' but does not declare it in meta.fixtures.`,
    why: "Module fixture registries and declared fixture names must stay aligned so app inventory and test seeding resolve the same contract.",
    help: `Add '${fixtureName}' to ${moduleId}'s meta.fixtures list or remove the registry entry from '${moduleId}.fixtures'.`,
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
    summary: `Flow module '${moduleId}' declared fixture '${fixtureName}' but did not provide a matching seeded fixture registry entry.`,
    why: "Declared fixture names are treated as executable inventory and must map to concrete seeded resources.",
    help: `Add '${moduleId}.fixtures.${fixtureName}' with seeded resources or remove '${fixtureName}' from ${moduleId}'s meta.fixtures declaration.`,
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
    summary: `flow.app(...) received more than one module with the id '${moduleId}'.`,
    why: "Module ids must stay unique so inventory summaries, module maps, and status surfaces do not collapse distinct definitions.",
    help: `Rename one module or reuse the same module definition instead of registering duplicate '${moduleId}' modules.`,
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
    summary: `Two distinct ${args.kind} descriptors resolved to the same public id '${args.descriptorId}'.`,
    why: "Descriptor ids must stay unique unless multiple modules intentionally share the exact same descriptor instance.",
    help: `Give each ${args.kind} a unique id or reuse the same descriptor object when the shared id is intentional.`,
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
    summary: `flowTest.app(...).seedModuleFixtures('${fixtureName}') could not find that fixture in any registered module.`,
    why: "Fixture seeding resolves against the app's declared module fixture inventory, and no module exposed this fixture name.",
    help: `Declare '${fixtureName}' in a module's meta.fixtures list and provide a matching fixtures registry entry before seeding it.`,
    debug: {
      fixtureName,
    },
  });
}

export function duplicateFlowActorIdDiagnostic(actorId: string, machineId: string): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.duplicateActorId,
    title: `Actor with id '${actorId}' already exists`,
    summary: `OrchestratorSystem.start attempted to register actor id '${actorId}' while another live actor still owned that id.`,
    why: "Actor ids must remain unique within a runtime so subscriptions, receipt ownership, and child routing stay deterministic.",
    help: `Pass a unique start({ id }) value or stop or dispose the existing actor before reusing '${actorId}'.`,
    debug: {
      actorId,
      machineId,
    },
  });
}

export function missingResourceRuntimeDetailsDiagnostic(refId: string): FlowDiagnostic {
  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.missingResourceRuntimeDetails,
    title: `Missing resource runtime details for ${refId}`,
    summary: `ResourceStore received ref '${refId}' without the runtime metadata needed to run lookups or compute freshness.`,
    why: "Flow resource refs are expected to come from flow.resource(...).ref(...); this ref did not carry the internal runtime payload the store needs.",
    help: `Create refs through the descriptor's .ref(...) helper and avoid hand-written clones or serialized copies when calling store.ensure(...) or store.refresh(...).`,
    debug: {
      refId,
    },
  });
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
    summary: `Flow attempted to start transaction '${args.transactionId}' while another attempt with ${args.concurrency} concurrency was still pending.`,
    why: `The transaction kept the active attempt in place because its concurrency policy is '${args.concurrency}' instead of queueing, cancelling, or allowing overlap.`,
    help: `Wait for '${args.transactionId}' to settle, guard the triggering transition while it is pending, or switch the transaction concurrency to 'serialize', 'cancel-previous', or 'allow'.`,
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
      summary: `Flow called the '${args.callback}' callback for transaction '${args.transactionId}', but the callback threw before transaction work could be resolved.`,
      why: "Transaction descriptor callbacks run synchronously while Flow resolves params, preview patches, invalidation targets, or the commit Effect. Throwing there bypasses normal transaction lanes unless Flow captures the defect as a tagged diagnostic.",
      help: "Keep transaction descriptor callbacks pure and return values instead of throwing. If the commit stage needs to fail, return an Effect that uses Effect.fail(...) or Effect.die(...) rather than throwing before the Effect is created.",
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
      summary: `Flow called the '${args.callback}' callback while routing a completion event for transaction '${args.transactionId}', but the callback threw before the machine event could be emitted.`,
      why: "Transaction outcome route callbacks run synchronously when Flow maps success, typed failure, defect, or interrupt completion lanes into machine events. Throwing there bypasses the normal outcome routing lane unless Flow captures the defect as a tagged diagnostic.",
      help: "Keep transaction outcome route callbacks pure and return events instead of throwing. If completion handling needs richer logic, encode it in the routed event and handle it in the receiving machine transition instead of throwing during route resolution.",
      debug: {
        transactionId: args.transactionId,
        callback: args.callback,
        cause: encodeDiagnosticDefect(args.cause),
      },
    }),
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
      summary: `Flow called the '${args.callback}' callback for stream '${args.streamId}', but the callback threw before stream work could finish routing.`,
      why: "Stream descriptor callbacks run synchronously while Flow resolves params, subscribes to the stream, computes pressure keys, or routes stream outcomes back into machine events. Throwing there bypasses normal stream lanes unless Flow captures the defect as a tagged diagnostic.",
      help: "Keep stream descriptor callbacks pure and return values instead of throwing. If stream work needs to fail, return a Stream that fails or dies instead of throwing before the Stream is created or before routing finishes.",
      debug: {
        streamId: args.streamId,
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
  return new FlowDiagnostic({
    code:
      kind === "maxFibers"
        ? FlowDiagnosticCodes.settleBoundsMaxFibers
        : FlowDiagnosticCodes.settleBoundsMaxTicks,
    title: `flowTest.settle exceeded ${kind} with maxTicks=${bounds.maxTicks} and maxFibers=${bounds.maxFibers}`,
    summary: `flowTest.settle could not reach a quiescent harness before the ${kind} bound was exceeded.`,
    why: "The harness still owned pending work after a flush turn, so the settle loop stopped instead of silently hiding live fibers.",
    help: "Increase the settle bounds if the background work is intentional, or inspect the pending timers, streams, transactions, mailboxes, and children to find the work that never quiesced.",
    debug: {
      bounds,
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
