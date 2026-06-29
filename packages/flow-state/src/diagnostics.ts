import { Data, Schema } from "effect";

import type { FlowTestPendingWork } from "./public/types.js";

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

export type AnyFlowDiagnosticDocument = FlowDiagnosticDocument | FlowBugDocument;

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

export function formatFlowDiagnostic(
  diagnostic: FlowDiagnostic | FlowBug | AnyFlowDiagnosticDocument,
): string {
  const document = flowDiagnosticDocumentOf(diagnostic);

  return [
    `[${document.code}] ${document.title}`,
    `what happened: ${document.summary}`,
    `why: ${document.why}`,
    `help: ${document.help}`,
    `debug: ${formatDebug(document.debug)}`,
  ].join("\n");
}

export function formatFlowDiagnosticPretty(
  diagnostic: FlowDiagnostic | FlowBug | AnyFlowDiagnosticDocument,
): string {
  const document = flowDiagnosticDocumentOf(diagnostic);

  return [
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
}

export class FlowDiagnostic extends Schema.TaggedErrorClass<FlowDiagnostic>(
  "@flow-state/core/FlowDiagnostic",
)("FlowDiagnostic", {
  code: FlowDiagnosticCodeSchema,
  ...flowDiagnosticDetailFields,
}) {
  constructor(document: FlowDiagnosticDocument) {
    super(document);
    this.message = formatFlowDiagnostic(document);
  }

  override toString(): string {
    return this.message;
  }
}

export class FlowBug extends Data.TaggedError("FlowBug")<FlowBugDocument> {
  constructor(document: FlowBugDocument) {
    super(document);
    this.message = formatFlowDiagnostic(document);
  }

  override toString(): string {
    return this.message;
  }
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
