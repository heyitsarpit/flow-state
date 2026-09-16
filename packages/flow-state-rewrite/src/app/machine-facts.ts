import { Predicate } from "effect";

import type {
  DefinitionList,
  RuntimeStateBranch,
  RuntimeStateTable,
  StateDeclaration,
  StateToken,
} from "../definition/domain.js";
import type { OperationDeclaration } from "../operation/operation.js";
import type { CompiledMachine, CompiledState, MachineDefinition } from "../machine/grammar.js";
import {
  isConstructedMachine,
  markMachineFacts,
  type Machine,
  type MachineRecordValue,
} from "../machine/machine.js";

const capturedMachineSources = new WeakMap<MachineRecordValue, MachineRecordValue>();

// RETURN_TYPE: The predicate ties a captured machine to the exact source identity passed to it.
export const isOwnedMachineFactsFor = <DefinitionValue extends MachineDefinition>(
  value: unknown,
  source: Machine<DefinitionValue>,
): value is Machine<DefinitionValue> =>
  isConstructedMachine(value) && capturedMachineSources.get(value) === source;

type StateCaptureBranch = Exclude<StateDeclaration, string>;

type StateCaptureList = DefinitionList<StateDeclaration>;

// RETURN_TYPE: The predicate validates every recursive authored-state branch before copying it.
const isStateDeclaration = (value: unknown): value is StateDeclaration => {
  if (Predicate.isString(value)) return true;

  if (!Predicate.isObject(value) || Array.isArray(value)) return false;

  return Object.values(value).every(
    (children) => Array.isArray(children) && children.every(isStateDeclaration),
  );
};

// RETURN_TYPE: The predicate validates the outer authored-state list before it crosses the capture boundary.
const isStateCaptureList = (value: unknown): value is StateCaptureList =>
  Array.isArray(value) && value.every(isStateDeclaration);

const copyRecord = <Value, CopiedValue>(
  source: Record<string, Value>,
  copy: (value: Value) => CopiedValue,
) => {
  const result: Record<string, CopiedValue> = Object.create(null);

  for (const key of Object.keys(source)) {
    const value = source[key];

    if (value !== undefined) result[key] = copy(value);
  }

  return result;
};

// RETURN_TYPE: Narrows recursive state containers before using their identity as a copy-map key.
const copyAuthoredStates = (value: StateCaptureList) => {
  const lists = new WeakMap<StateCaptureList, StateDeclaration[]>();
  const branches = new WeakMap<StateCaptureBranch, StateCaptureBranch>();

  const copyList = (current: StateCaptureList) => {
    const existing = lists.get(current);

    if (existing !== undefined) return existing;
    const result: StateDeclaration[] = [];
    lists.set(current, result);

    for (const item of current) result.push(copyState(item));

    return result;
  };

  const copyBranch = (current: StateCaptureBranch) => {
    const existing = branches.get(current);

    if (existing !== undefined) return existing;
    const result: StateCaptureBranch = Object.create(null);
    branches.set(current, result);

    for (const [key, children] of Object.entries(current)) result[key] = copyList(children);

    return result;
  };

  const copyState = (current: StateDeclaration) =>
    Predicate.isString(current) ? current : copyBranch(current);

  return copyList(value);
};

// RETURN_TYPE: The predicate narrows exposed state entries before runtime-table copying.
const isStateToken = (value: unknown): value is StateToken =>
  Predicate.isObject(value) &&
  value.kind === "state" &&
  Predicate.isString(value.name) &&
  Predicate.isString(value.id);

// RETURN_TYPE: Keeps malformed exposed entries out of the recursive branch copy.
const isRuntimeStateBranch = (value: unknown): value is RuntimeStateBranch =>
  Predicate.isObject(value) &&
  !Array.isArray(value) &&
  !isStateToken(value) &&
  Object.prototype.hasOwnProperty.call(value, "S") &&
  Predicate.isObject(value.S) &&
  !Array.isArray(value.S);

const copyStateTable = (source: RuntimeStateTable) => {
  const tables = new WeakMap<RuntimeStateTable, RuntimeStateTable>();
  const branches = new WeakMap<RuntimeStateBranch, RuntimeStateBranch>();

  // RETURN_TYPE: Mutual recursion with copyBranch needs this fixed recursive table type.
  const copyTable = (current: RuntimeStateTable): RuntimeStateTable => {
    const existing = tables.get(current);

    if (existing !== undefined) return existing;
    const result: RuntimeStateTable = Object.create(null);
    tables.set(current, result);

    for (const [key, entry] of Object.entries(current))
      result[key] = isRuntimeStateBranch(entry) ? copyBranch(entry) : entry;

    return result;
  };

  const copyBranch = (current: RuntimeStateBranch) => {
    const existing = branches.get(current);

    if (existing !== undefined) return existing;
    const result: RuntimeStateBranch = { S: current.S };
    Object.setPrototypeOf(result, null);
    branches.set(current, result);
    result.S = copyTable(current.S);

    return result;
  };

  return copyTable(source);
};

const copyCapturedOperations = (catalog: Map<string, OperationDeclaration>) => {
  const result: Record<string, OperationDeclaration> = Object.create(null);

  for (const [key, descriptor] of catalog) result[key] = descriptor;

  return result;
};

const copyMachineDefinition = <DefinitionValue extends MachineDefinition>(
  source: DefinitionValue,
  operationCatalog: Map<string, OperationDeclaration>,
) => {
  const captured = {
    ...source,
    S: copyStateTable(source.S),
    E: copyRecord(source.E, (event) => event),
    context: copyRecord(source.context, (selector) => selector),
    operations: copyCapturedOperations(operationCatalog),
  };

  const states = Object.getOwnPropertyDescriptor(source, "states");

  if (states === undefined || !("value" in states) || !isStateCaptureList(states.value))
    return captured;

  Object.defineProperty(captured, "states", {
    configurable: true,
    enumerable: true,
    value: copyAuthoredStates(states.value),
    writable: true,
  });

  return captured;
};

const copyCompiledHandlers = <DefinitionValue extends MachineDefinition>(
  source: CompiledState<DefinitionValue>["handlers"],
) => {
  const result: CompiledState<DefinitionValue>["handlers"] = {};

  const copyHandler = <Name extends keyof typeof source>(name: Name) => {
    const transitions = source[name];

    Object.defineProperty(result, name, {
      value:
        transitions === undefined
          ? undefined
          : transitions.map((transition) => ({ ...transition })),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  };

  for (const name in source) {
    if (Object.prototype.hasOwnProperty.call(source, name)) copyHandler(name);
  }

  return result;
};

// RETURN_TYPE: The state discriminant and private DefinitionValue correlation must remain visible to the capture owner.
const copyCompiledState = <DefinitionValue extends MachineDefinition>(
  source: CompiledState<DefinitionValue>,
): CompiledState<DefinitionValue> => {
  const copiedBehavior = {
    handlers: copyCompiledHandlers(source.handlers),
    redirects: source.redirects.map((redirect) => ({ ...redirect })),
    activities: copyRecord(source.activities, (activity) => activity),
    timers: copyRecord(source.timers, (timer) => ({ ...timer })),
  };

  if (source.kind === "leaf")
    return {
      ...source,
      ...copiedBehavior,
      children: [],
    } satisfies Extract<CompiledState<DefinitionValue>, { kind: "leaf" }>;

  return {
    ...source,
    ...copiedBehavior,
    children: [...source.children],
  } satisfies Extract<CompiledState<DefinitionValue>, { kind: "compound" }>;
};

const copyCompiledMachine = <DefinitionValue extends MachineDefinition>(
  source: CompiledMachine<DefinitionValue>,
) => ({
  states: copyRecord(source.states, copyCompiledState),
  context: source.context.map((registration) => ({ ...registration })),
  memory: source.memory.map((registration) => ({ ...registration })),
});

export const captureMachineFacts = <DefinitionValue extends MachineDefinition>(
  source: Machine<DefinitionValue>,
  operationCatalog: Map<string, OperationDeclaration>,
) => {
  const captured = markMachineFacts({
    ...source,
    definition: copyMachineDefinition(source.definition, operationCatalog),
    compiled: copyCompiledMachine(source.compiled),
  });

  capturedMachineSources.set(captured, source);

  return captured;
};
