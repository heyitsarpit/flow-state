import { Option, Result } from "effect";

import type { StateOf } from "../definition/domain.js";
import type * as Diagnostic from "../diagnostic/diagnostic.js";
import {
  admitStateBehavior,
  admitStateConfiguration,
  configurationPath,
  invalidConfiguration,
} from "./admission.js";
import type { AdmittedStateBehavior, StateBehaviorConfiguration } from "./admission.js";
import { invalidMachineConfigurationDiagnostic } from "./diagnostic.js";
import { readTokenText } from "./reflection.js";
import type {
  CompiledMachine,
  CompiledState,
  ContextRegistration,
  MachineDefinition,
  MachineNodeConfiguration,
  MemoryRegistration,
  StateNode,
  Timer,
  TokenLookup,
} from "./grammar.js";

/*
 * Compilation:
 *
 * Definition indexing:
 *   indexDefinition, buildStateNodes, tokenLookup
 *
 * Structural admission:
 *   admitStructure, validateStateToken
 *   Completes the entire configuration tree before behavior resolution.
 *
 * Behavior resolution:
 *   resolveBehavior, validateEventToken
 *   Produces a trusted tree in preorder.
 *
 * Emission:
 *   emitStates
 *   Builds the published state index without expected validation failures.
 *
 * Assembly:
 *   compileMachine
 *   Publishes the index and copies collected registrations.
 */

type StatePath = readonly string[];

type MachineSymbols<DefinitionValue extends MachineDefinition> = {
  readonly stateTokens: TokenLookup<StateOf<DefinitionValue>>;
  readonly eventTokens: TokenLookup<Timer<DefinitionValue>["target"]>;
  readonly events: DefinitionValue["E"];
  readonly operations: DefinitionValue["operations"];
};

type StateTree<DefinitionValue extends MachineDefinition, Behavior> =
  | {
      readonly kind: "leaf";
      readonly path: StatePath;
      readonly token: StateOf<DefinitionValue>;
      readonly behavior: Behavior;
    }
  | {
      readonly kind: "compound";
      readonly path: StatePath;
      readonly default: StateOf<DefinitionValue>;
      readonly behavior: Behavior;
      readonly children: readonly StateTree<DefinitionValue, Behavior>[];
    };

type StructuredState<DefinitionValue extends MachineDefinition> = StateTree<
  DefinitionValue,
  StateBehaviorConfiguration
>;

type ResolvedState<DefinitionValue extends MachineDefinition> = StateTree<
  DefinitionValue,
  AdmittedStateBehavior<DefinitionValue>
>;

// Definition indexing

const tokenLookup =
  <Token>(tokens: ReadonlyMap<unknown, Token>) =>
  (value: unknown) =>
    Option.fromNullishOr(tokens.get(value));

// RETURN_TYPE: Recursive child construction needs an explicit array type to anchor StateNode inference.
const buildStateNodes = <DefinitionValue extends MachineDefinition>(
  table: DefinitionValue["S"],
  parentPath: StatePath,
  tokens: Map<unknown, StateOf<DefinitionValue>>,
): readonly StateNode<DefinitionValue>[] =>
  Object.entries(table).map(([name, value]) => {
    const path = [...parentPath, name];
    if ("kind" in value) {
      // SAFETY: this token is read directly from the admitted Definition.S table.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Definition.S admission owns this exact state-token identity; the generic table view cannot retain the leaf union.
      const token = value as StateOf<DefinitionValue>;
      tokens.set(value, token);
      return { kind: "leaf", name, path, token, children: [] } satisfies StateNode<DefinitionValue>;
    }
    return {
      kind: "compound",
      name,
      path,
      children: buildStateNodes<DefinitionValue>(value.S, path, tokens),
    } satisfies StateNode<DefinitionValue>;
  });

const indexDefinition = <DefinitionValue extends MachineDefinition>(
  definition: DefinitionValue,
) => {
  const stateTokenIndex = new Map<unknown, StateOf<DefinitionValue>>();
  const root: StateNode<DefinitionValue> = {
    kind: "compound",
    name: "",
    path: [],
    children: buildStateNodes<DefinitionValue>(definition.S, [], stateTokenIndex),
  };

  // SAFETY: Definition.E is the exact event-token registry for this Definition identity.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the admitted registry's generic Object.values view widens its exact event-token values.
  const registeredEvents = Object.values(definition.E) as Timer<DefinitionValue>["target"][];
  const eventTokenIndex = new Map<unknown, Timer<DefinitionValue>["target"]>();
  for (const event of registeredEvents) eventTokenIndex.set(event, event);

  return {
    root,
    symbols: {
      stateTokens: tokenLookup(stateTokenIndex),
      eventTokens: tokenLookup(eventTokenIndex),
      events: definition.E,
      operations: definition.operations,
    } satisfies MachineSymbols<DefinitionValue>,
  };
};

// Structural admission

const isForeignStateToken = (value: unknown) => {
  const kind = readTokenText(value, "kind");
  if (Result.isFailure(kind) || Option.isNone(kind.success) || kind.success.value !== "state")
    return false;
  const id = readTokenText(value, "id");
  const name = readTokenText(value, "name");
  return (
    Result.isSuccess(id) &&
    Option.isSome(id.success) &&
    Result.isSuccess(name) &&
    Option.isSome(name.success)
  );
};

const validateStateToken = <DefinitionValue extends MachineDefinition>(
  tokens: TokenLookup<StateOf<DefinitionValue>>,
  value: unknown,
  path: Diagnostic.Path,
) =>
  Result.fromOption(tokens(value), () => {
    const foreign = isForeignStateToken(value);
    return invalidMachineConfigurationDiagnostic(
      foreign ? "UnknownStateToken" : "InvalidStateToken",
      path,
      { issue: foreign ? "foreign-definition" : "definition-identity" },
    );
  });

// RETURN_TYPE: Recursive Result.gen structural admission needs an explicit result to anchor StateTree's readonly union.
const admitStructure = <DefinitionValue extends MachineDefinition>(
  node: StateNode<DefinitionValue>,
  configuration: unknown,
  symbols: MachineSymbols<DefinitionValue>,
): Result.Result<StructuredState<DefinitionValue>, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const statePath = configurationPath(node.path, []);
    if (node.kind === "leaf") {
      const admitted = yield* admitStateConfiguration(configuration, statePath, node);
      return {
        kind: "leaf",
        path: node.path,
        token: node.token,
        behavior: admitted.behavior,
      } satisfies StructuredState<DefinitionValue>;
    }

    const admitted = yield* admitStateConfiguration(configuration, statePath, node);
    const validDefault = yield* validateStateToken(symbols.stateTokens, admitted.default, [
      ...statePath,
      "default",
    ]);
    if (!node.children.some((child) => child.kind === "leaf" && child.token === validDefault))
      return yield* invalidConfiguration("InvalidDefaultTarget", [...statePath, "default"]);

    const children: StructuredState<DefinitionValue>[] = [];
    for (const child of node.children)
      children.push(yield* admitStructure(child, admitted.children.get(child.name), symbols));
    return {
      kind: "compound",
      path: node.path,
      default: validDefault,
      behavior: admitted.behavior,
      children,
    } satisfies StructuredState<DefinitionValue>;
  });

// Behavior resolution

const validateEventToken = <DefinitionValue extends MachineDefinition>(
  tokens: TokenLookup<Timer<DefinitionValue>["target"]>,
  value: unknown,
  path: Diagnostic.Path,
) =>
  Result.fromOption(tokens(value), () =>
    invalidMachineConfigurationDiagnostic("UnknownEventToken", path, {
      issue: "definition-identity",
    }),
  );

// RETURN_TYPE: Recursive Result.gen behavior resolution needs an explicit result to anchor the trusted StateTree union.
const resolveBehavior = <DefinitionValue extends MachineDefinition>(
  state: StructuredState<DefinitionValue>,
  symbols: MachineSymbols<DefinitionValue>,
  inheritedHandlers: ReadonlySet<string>,
): Result.Result<ResolvedState<DefinitionValue>, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const behavior = yield* admitStateBehavior<DefinitionValue>(
      state.behavior,
      state.path,
      symbols.events,
      symbols.operations,
      inheritedHandlers,
      (value, path) => validateStateToken(symbols.stateTokens, value, path),
      (value, path) => validateEventToken(symbols.eventTokens, value, path),
    );
    if (state.kind === "leaf")
      return {
        kind: "leaf",
        path: state.path,
        token: state.token,
        behavior,
      } satisfies ResolvedState<DefinitionValue>;

    const nextInheritedHandlers = new Set(inheritedHandlers);
    for (const name of Object.keys(behavior.handlers)) nextInheritedHandlers.add(name);
    const children: ResolvedState<DefinitionValue>[] = [];
    for (const child of state.children)
      children.push(yield* resolveBehavior(child, symbols, nextInheritedHandlers));
    return {
      kind: "compound",
      path: state.path,
      default: state.default,
      behavior,
      children,
    } satisfies ResolvedState<DefinitionValue>;
  });

// Emission

const stateDisplayPath = (path: StatePath) => (path.length === 0 ? "" : `S.${path.join(".S.")}`);

const stateKey = (path: StatePath) =>
  path.every((segment) => !/[.[\]]/u.test(segment) && segment !== "S")
    ? stateDisplayPath(path)
    : `@${JSON.stringify(path)}`;

// RETURN_TYPE: Publishes a readonly state index after private preorder mutation.
const emitStates = <DefinitionValue extends MachineDefinition>(
  state: ResolvedState<DefinitionValue>,
): Readonly<Record<string, CompiledState<DefinitionValue>>> => {
  const states: Record<string, CompiledState<DefinitionValue>> = Object.create(null);
  const emitState = (current: ResolvedState<DefinitionValue>) => {
    if (current.kind === "compound") {
      const compiledState = {
        path: stateDisplayPath(current.path),
        kind: "compound",
        default: current.default,
        children: current.children.map((child) => stateKey(child.path)),
        ...current.behavior,
      } satisfies CompiledState<DefinitionValue>;
      states[stateKey(current.path)] = compiledState;
      for (const child of current.children) emitState(child);
      return;
    }

    const compiledState = {
      path: stateDisplayPath(current.path),
      kind: "leaf",
      state: current.token,
      children: [],
      ...current.behavior,
    } satisfies CompiledState<DefinitionValue>;
    states[stateKey(current.path)] = compiledState;
  };

  emitState(state);
  return states;
};

// Assembly

// RETURN_TYPE: Preserves the generic CompiledMachine publication after inferred generic casting fails with TS2352.
export const compileMachine = <
  DefinitionValue extends MachineDefinition,
  Configuration extends MachineNodeConfiguration<DefinitionValue>,
>(
  definition: DefinitionValue,
  configuration: Configuration,
  context: readonly ContextRegistration<DefinitionValue>[],
  memory: readonly MemoryRegistration<DefinitionValue>[],
): Result.Result<CompiledMachine<DefinitionValue>, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const { root, symbols } = indexDefinition(definition);
    const structured = yield* admitStructure(root, configuration, symbols);
    const resolved = yield* resolveBehavior(structured, symbols, new Set());

    return {
      states: emitStates(resolved),
      context: [...context],
      memory: [...memory],
    } satisfies CompiledMachine<DefinitionValue>;
  });
