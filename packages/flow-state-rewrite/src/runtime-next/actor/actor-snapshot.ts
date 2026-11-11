import { Predicate, Result } from "effect";

import type { ContextSelector, DefinitionIdentity, StateToken } from "../../definition/domain.js";
import { isRegisteredContextSelector, isRegisteredStateToken } from "../../definition/schema.js";
import { Diagnostic, Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import { isConstructedMachine, type Machine } from "../../machine/machine.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { OperationDeclaration } from "../../operation/operation.js";
import type { ActorSnapshot } from "../runtime.js";
import { copyStructural, makeStructuralCopyIdentityLookup } from "../structural-copy.js";
import type { StructuralCopyIdentityLookup } from "../structural-copy.js";
import type { ActorOperationReaders } from "./actor-activities.js";

/** A publication is one complete, owned actor observation and its private cursors. */
export type ActorPublication<D extends MachineDefinition> = {
  snapshot: ActorSnapshot<D>;
  machineTurnRevision: number;
  evidenceSequence: number;
};

export type ActorSnapshotStaticIdentity = StateToken | OperationDeclaration | ContextSelector;

export type ActorSnapshotCopyPolicy = StructuralCopyIdentityLookup<ActorSnapshotStaticIdentity>;

export const invalidSnapshot = (part: string, reason: string) =>
  Failure({
    code: "SchemaValidation",
    path: ["snapshot", part],
    details: { reason },
    summary: "Actor snapshot is not a complete value for this machine.",
    help: "Supply one prepared snapshot with the machine's exact state and context.",
  });

type SnapshotObject = Exclude<WeakKey, symbol>;

const exactKeys = (value: SnapshotObject, expected: string[]) => {
  const keys = Object.keys(value);
  const present = new Set(keys);

  return keys.length === expected.length && expected.every((key) => present.has(key));
};

const appendRegisteredTokens = (
  opaque: WeakSet<SnapshotObject>,
  value: SnapshotObject,
  visited: WeakSet<SnapshotObject>,
) => {
  const pending = [value];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) continue;

    if (visited.has(current)) continue;
    visited.add(current);

    for (const member of Object.values(current)) {
      if (isRegisteredStateToken(member)) opaque.add(member);
      else if (Predicate.isObject(member)) pending.push(member);
    }
  }
};

const appendProviderDefinitions = (
  opaque: WeakSet<SnapshotObject>,
  provider: DefinitionIdentity,
  visitedProviders: WeakSet<SnapshotObject>,
  visitedStateTables: WeakSet<SnapshotObject>,
) => {
  const pendingProviders = [provider];

  while (pendingProviders.length > 0) {
    const current = pendingProviders.pop();

    if (current === undefined || visitedProviders.has(current)) continue;
    visitedProviders.add(current);

    // FLOW_STATE_ALLOW_UNKNOWN: Constructed provider state tables preserve registered token identity during snapshot copying.
    const table = Object.getOwnPropertyDescriptor(current, "S")?.value;

    if (Predicate.isObject(table)) appendRegisteredTokens(opaque, table, visitedStateTables);

    const context = Object.getOwnPropertyDescriptor(current, "context")?.value;

    if (!Predicate.isObject(context)) continue;

    for (const selector of Object.values(context)) {
      if (!isRegisteredContextSelector(selector)) continue;
      opaque.add(selector);
      pendingProviders.push(selector.provider);
    }
  }
};

export const captureActorSnapshotCopyPolicy = <D extends MachineDefinition>(
  machine: Machine<D>,
) => {
  const opaque = new WeakSet<SnapshotObject>();
  const visitedProviders = new WeakSet<SnapshotObject>();
  const visitedStateTables = new WeakSet<SnapshotObject>();

  for (const state of Object.values(machine.compiled.states)) {
    if (state.kind === "leaf" && Predicate.isObject(state.state)) opaque.add(state.state);
  }

  for (const descriptor of Object.values(machine.definition.operations))
    if (Predicate.isObject(descriptor)) opaque.add(descriptor);

  for (const selector of Object.values(machine.definition.context)) {
    opaque.add(selector);
    appendProviderDefinitions(opaque, selector.provider, visitedProviders, visitedStateTables);
  }

  // RETURN_TYPE: This guard carries captured definitions into the actor's static identity projection.
  const isActorSnapshotIdentity = (value: SnapshotObject): value is ActorSnapshotStaticIdentity =>
    opaque.has(value);

  return makeStructuralCopyIdentityLookup<ActorSnapshotStaticIdentity>(isActorSnapshotIdentity);
};

// oxlint-disable-next-line anti-slop/no-readonly -- Published diagnostics are input observations that this owner copies without mutating.
const ownIssues = (issues: readonly PublicDiagnostic[]) => {
  const owned: Diagnostic[] = [];

  for (const issue of issues) {
    if (!(issue instanceof Diagnostic)) return Result.fail(invalidSnapshot("issues", "diagnostic"));

    const fields = copyStructural({ path: issue.path, details: issue.details }, "actor");

    if (Result.isFailure(fields)) return Result.fail(fields.failure);

    owned.push(
      new Diagnostic({
        classification: issue.classification,
        code: issue.code,
        path: fields.success.path,
        details: fields.success.details,
        summary: issue.summary,
        help: issue.help,
      }),
    );
  }

  return Result.succeed(owned);
};

const validateActorHeader = <D extends MachineDefinition>(
  machine: Machine<D>,
  value: ActorSnapshot<D>,
) => {
  const hasRequiredFields = exactKeys(value, [
    "state",
    "memory",
    "context",
    "lifecycle",
    "O",
    "timers",
    "issues",
    "revision",
    "observedStoreRevision",
  ]);

  if (!hasRequiredFields) return Result.fail(invalidSnapshot("shape", "exact-fields"));

  const validState = Object.values(machine.compiled.states).some(
    (state) => state.kind === "leaf" && Object.is(state.state, value.state),
  );

  if (!validState) return Result.fail(invalidSnapshot("state", "leaf-identity"));

  if (value.lifecycle !== "prepared") return Result.fail(invalidSnapshot("lifecycle", "prepared"));

  const validRevision =
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    Number.isSafeInteger(value.observedStoreRevision) &&
    value.observedStoreRevision >= 0;

  return validRevision
    ? Result.succeed(undefined)
    : Result.fail(invalidSnapshot("revision", "safe-integer"));
};

const validateActorPayload = <D extends MachineDefinition>(
  machine: Machine<D>,
  value: ActorSnapshot<D>,
) => {
  if (!Predicate.isObject(value.memory) || Array.isArray(value.memory))
    return Result.fail(invalidSnapshot("memory", "record"));

  const validContext =
    Predicate.isObject(value.context) &&
    !Array.isArray(value.context) &&
    exactKeys(value.context, Object.keys(machine.definition.context));

  if (!validContext) return Result.fail(invalidSnapshot("context", "machine-slots"));

  const validReaders =
    Predicate.isObject(value.O) &&
    !Array.isArray(value.O) &&
    exactKeys(value.O, Object.keys(machine.definition.operations));

  if (!validReaders) return Result.fail(invalidSnapshot("O", "machine-operations"));

  if (!Array.isArray(value.timers) || !Array.isArray(value.issues))
    return Result.fail(invalidSnapshot("collections", "arrays"));

  return Result.succeed(undefined);
};

/** Admit a detached prepared or restored snapshot before an engine can be installed. */
export const prepareActorSnapshot = <D extends MachineDefinition>(
  machine: Machine<D>,
  snapshot: ActorSnapshot<D>,
  readers: ActorOperationReaders<D>,
) => {
  if (!isConstructedMachine(machine))
    return Result.fail(invalidSnapshot("machine", "constructed-machine"));

  const inspectedIssues = Result.try({
    try: () => {
      // FLOW_STATE_ALLOW_UNKNOWN: Hostile snapshot reflection is inspected before the actor copy boundary.
      const issues: unknown = Object.getOwnPropertyDescriptor(snapshot, "issues")?.value;

      return Array.isArray(issues) ? issues.filter((issue) => issue instanceof Diagnostic) : [];
    },
    catch: () => invalidSnapshot("issues", "reflection"),
  });

  if (Result.isFailure(inspectedIssues)) return Result.fail(inspectedIssues.failure);
  const copyPolicy = captureActorSnapshotCopyPolicy(machine);

  const owned = copyStructural(snapshot, "actor", inspectedIssues.success, undefined, copyPolicy);

  if (Result.isFailure(owned)) return Result.fail(owned.failure);
  const header = validateActorHeader<D>(machine, owned.success);

  if (Result.isFailure(header)) return Result.fail(header.failure);
  const payload = validateActorPayload<D>(machine, owned.success);

  if (Result.isFailure(payload)) return Result.fail(payload.failure);

  return Result.map(
    preparePublishedSnapshot<D>({ ...owned.success, O: readers }, copyPolicy),
    (published) => ({ snapshot: published, copyPolicy }),
  );
};

/** Publish a candidate only after its owner has completed fallible preflight. */
export const preparePublishedSnapshot = <D extends MachineDefinition>(
  candidate: ActorSnapshot<D>,
  copyPolicy: ActorSnapshotCopyPolicy,
) => {
  const issues = ownIssues(candidate.issues);

  if (Result.isFailure(issues)) return Result.fail(issues.failure);

  return copyStructural(
    { ...candidate, issues: issues.success },
    "actor",
    issues.success,
    undefined,
    copyPolicy,
  );
};
