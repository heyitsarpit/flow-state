import { Predicate, Result, Struct } from "effect";

import {
  definitionMetadata,
  type StateMetadata,
} from "../definition/metadata.js";
import type { StateOf } from "../definition/domain.js";
import * as Diagnostic from "../diagnostic/diagnostic.js";
import { invalidMachineConfigurationDiagnostic } from "./diagnostic.js";
import type {
  CompiledMachine,
  CompiledState,
  CompiledTimer,
  CompiledTransition,
  ContextRegistration,
  EventName,
  MachineActivity,
  MachineDefinition,
  MachineNodeConfiguration,
  MachineStateBehavior,
  MemoryRegistration,
  Redirect,
  Timer,
  Transition,
} from "./grammar.js";

type StatePath = readonly string[];

type CompileResult<Value> = Diagnostic.Result<Value>;

const isConfigurationRecord = <DefinitionValue extends MachineDefinition>(
  value: unknown,
): value is MachineNodeConfiguration<DefinitionValue> =>
  Predicate.isObject(value) && !Array.isArray(value);

const propertyName = (key: PropertyKey): string => String(key);

const readDataProperty = <Value>(value: object, key: string): Value | undefined => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor
    ? (descriptor.value as Value)
    : undefined;
};

const stateDisplayPath = (path: StatePath): string =>
  path.length === 0 ? "" : `S.${path.join(".S.")}`;

const stateKey = (path: StatePath): string => {
  const display = stateDisplayPath(path);
  return path.every((segment) => !/[.[\]]/u.test(segment) && segment !== "S")
    ? display
    : `@${JSON.stringify(path)}`;
};

const configurationPath = (
  path: StatePath,
  suffix: readonly (string | number)[],
): Diagnostic.Path =>
  path
    .reduce<Diagnostic.Path>((result, segment) => [...result, "states", segment], [])
    .concat(suffix);

const invalidTimerDelay = (path: Diagnostic.Path): CompileResult<never> =>
  Result.fail(
    invalidMachineConfigurationDiagnostic("InvalidTimerDelay", path, {
      constraint: "finite-non-negative",
    }),
  );

const invalidConfigurationKey = (
  reason:
    | "ExtraStateConfigurationKey"
    | "ExtraTransitionKey"
    | "ExtraTimerKey"
    | "ForbiddenTimerActions"
    | "UnexpectedConfigurationField",
  path: Diagnostic.Path,
  key: PropertyKey,
): CompileResult<never> =>
  Result.fail(
    invalidMachineConfigurationDiagnostic(reason, [...path, propertyName(key)], {
      key: propertyName(key),
    }),
  );

const invalidConfiguration = (
  reason: Parameters<typeof invalidMachineConfigurationDiagnostic>[0],
  path: Diagnostic.Path,
  details: Diagnostic.Details = {},
): CompileResult<never> =>
  Result.fail(invalidMachineConfigurationDiagnostic(reason, path, details));

const validateExactDataKeys = (
  value: object,
  path: Diagnostic.Path,
  allowedKeys: readonly string[],
  extraKeyReason:
    | "ExtraStateConfigurationKey"
    | "ExtraTransitionKey"
    | "ExtraTimerKey"
    | "UnexpectedConfigurationField",
): CompileResult<void> => {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedKeys.includes(key))
      return invalidConfigurationKey(extraKeyReason, path, key);

    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true)
      return invalidConfigurationKey("UnexpectedConfigurationField", path, key);
  }
  return Result.succeed(undefined);
};

const collectStateTokens = (node: StateMetadata, tokens: Set<object>): void => {
  if (node.token !== undefined) tokens.add(node.token);
  for (const child of node.children) collectStateTokens(child, tokens);
};

const isOwnedStateToken = <DefinitionValue extends MachineDefinition>(
  tokens: ReadonlySet<object>,
  value: unknown,
): value is StateOf<DefinitionValue> => Predicate.isObject(value) && tokens.has(value);

const validateStateToken = <DefinitionValue extends MachineDefinition>(
  tokens: ReadonlySet<object>,
  value: unknown,
  path: Diagnostic.Path,
): CompileResult<StateOf<DefinitionValue>> =>
  isOwnedStateToken<DefinitionValue>(tokens, value)
    ? Result.succeed(value)
    : Result.fail(
        invalidMachineConfigurationDiagnostic("InvalidStateToken", path, {
          issue: "definition-identity",
        }),
      );

const isStateToken = <DefinitionValue extends MachineDefinition>(
  tokens: ReadonlySet<object>,
  value: unknown,
): value is StateOf<DefinitionValue> => isOwnedStateToken<DefinitionValue>(tokens, value);

const compileTransition = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  value: unknown,
  path: Diagnostic.Path,
  stateTokens: ReadonlySet<object>,
): CompileResult<CompiledTransition<DefinitionValue, Name>> => {
  return Result.gen(function* () {
    if (isStateToken<DefinitionValue>(stateTokens, value)) return { target: value };
    if (!isConfigurationRecord<DefinitionValue>(value))
      return yield* invalidConfiguration("ExpectedTransition", path);
    if (readDataProperty(value, "kind") === "state")
      return yield* invalidConfiguration("InvalidStateToken", path, {
        issue: "definition-identity",
      });

    yield* validateExactDataKeys(
      value,
      path,
      ["target", "guard", "updateMemory", "actions", "reenter"],
      "ExtraTransitionKey",
    );
    if (!Object.hasOwn(value, "target"))
      return yield* invalidConfiguration("TransitionObjectRequired", path);

    const target = yield* validateStateToken<DefinitionValue>(
      stateTokens,
      readDataProperty(value, "target"),
      [...path, "target"],
    );
    const guard = readDataProperty<CompiledTransition<DefinitionValue, Name>["guard"]>(
      value,
      "guard",
    );
    const updateMemory = readDataProperty<
      CompiledTransition<DefinitionValue, Name>["updateMemory"]
    >(value, "updateMemory");
    const actions = readDataProperty<CompiledTransition<DefinitionValue, Name>["actions"]>(
      value,
      "actions",
    );
    const reenter = readDataProperty<CompiledTransition<DefinitionValue, Name>["reenter"]>(
      value,
      "reenter",
    );
    for (const [key, callback] of [
      ["guard", guard],
      ["updateMemory", updateMemory],
      ["actions", actions],
    ] as const) {
      if (callback !== undefined && !Predicate.isFunction(callback))
        return yield* invalidConfiguration("ExpectedFunction", [...path, key], { field: key });
    }
    const validReenter =
      reenter === undefined
        ? undefined
        : yield* validateStateToken<DefinitionValue>(stateTokens, reenter, [...path, "reenter"]);
    return {
      target,
      ...(guard === undefined ? {} : { guard }),
      ...(updateMemory === undefined ? {} : { updateMemory }),
      ...(actions === undefined ? {} : { actions }),
      ...(validReenter === undefined ? {} : { reenter: validReenter }),
    } satisfies CompiledTransition<DefinitionValue, Name>;
  });
};

type EventEntry<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
> =
  | StateOf<DefinitionValue>
  | Transition<DefinitionValue, Name>
  | readonly [Transition<DefinitionValue, Name>, ...Transition<DefinitionValue, Name>[]];

const isTransitionList = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  value: EventEntry<DefinitionValue, Name>,
): value is readonly [Transition<DefinitionValue, Name>, ...Transition<DefinitionValue, Name>[]] =>
  Array.isArray(value);

const compileEventEntry = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  value: EventEntry<DefinitionValue, Name>,
  path: Diagnostic.Path,
  stateTokens: ReadonlySet<object>,
): CompileResult<readonly CompiledTransition<DefinitionValue, Name>[]> => {
  const list = isTransitionList(value);
  const entries = list ? value : [value];
  return Result.gen(function* () {
    const transitions: CompiledTransition<DefinitionValue, Name>[] = [];
    for (const [index, entry] of entries.entries()) {
      transitions.push(
        yield* compileTransition<DefinitionValue, Name>(
          entry,
          list ? [...path, index] : path,
          stateTokens,
        ),
      );
    }
    return transitions;
  });
};

const compileHandlers = <DefinitionValue extends MachineDefinition>(
  behavior: MachineStateBehavior<DefinitionValue>,
  path: StatePath,
  stateTokens: ReadonlySet<object>,
): CompileResult<
  Readonly<Partial<{
    [Name in EventName<DefinitionValue>]: readonly CompiledTransition<DefinitionValue, Name>[];
  }>>
> => {
  const handlers: Partial<
    {
      [Name in EventName<DefinitionValue>]: readonly CompiledTransition<DefinitionValue, Name>[];
    }
  > = Object.create(null);
  if (behavior.on === undefined) return Result.succeed(handlers);
  const on = behavior.on;

  return Result.gen(function* () {
    for (const name of Struct.keys(on)) {
      const entry = on[name];
      if (entry === undefined) continue;
      Object.assign(handlers, {
        [name]: yield* compileEventEntry<DefinitionValue, typeof name>(
          entry,
          configurationPath(path, ["on", name]),
          stateTokens,
        ),
      });
    }
    return handlers;
  });
};

const collectOwnHandlers = <DefinitionValue extends MachineDefinition>(
  node: StateMetadata,
  configuration: MachineNodeConfiguration<DefinitionValue>,
  inheritedHandlers: ReadonlySet<string>,
): CompileResult<ReadonlySet<string>> =>
  Result.gen(function* () {
    const ownHandlers = new Set<string>();
    if (configuration.on === undefined) return ownHandlers;

    for (const name of Struct.keys(configuration.on)) {
      if (inheritedHandlers.has(name)) {
        return yield* Result.fail(
          invalidMachineConfigurationDiagnostic(
            "AmbiguousHandler",
            configurationPath(node.path, []),
            {
              event: name,
            },
          ),
        );
      }
      ownHandlers.add(name);
    }
    return ownHandlers;
  });

const compileRedirects = <DefinitionValue extends MachineDefinition>(
  behavior: MachineStateBehavior<DefinitionValue>,
  path: StatePath,
  stateTokens: ReadonlySet<object>,
): CompileResult<readonly Redirect<DefinitionValue>[]> =>
  Result.gen(function* () {
    if (behavior.redirect === undefined) return [];
    const redirects = Array.isArray(behavior.redirect) ? behavior.redirect : [behavior.redirect];
    if (redirects.length === 0)
      return yield* invalidConfiguration("EmptyRedirectList", configurationPath(path, ["redirect"]));

    const compiled: Redirect<DefinitionValue>[] = [];
    for (const [index, value] of redirects.entries()) {
      const redirectPath = configurationPath(
        path,
        ["redirect", ...(Array.isArray(behavior.redirect) ? [index] : [])],
      );
      if (!isConfigurationRecord<DefinitionValue>(value))
        return yield* invalidConfiguration("ExpectedRedirect", redirectPath);
      yield* validateExactDataKeys(
        value,
        redirectPath,
        ["when", "target"],
        "UnexpectedConfigurationField",
      );
      if (!Object.hasOwn(value, "when") || !Object.hasOwn(value, "target"))
        return yield* invalidConfiguration("ExpectedRedirect", redirectPath);

      const when = readDataProperty<Redirect<DefinitionValue>["when"]>(value, "when");
      if (!Predicate.isFunction(when))
        return yield* invalidConfiguration("ExpectedFunction", [...redirectPath, "when"], {
          field: "when",
        });
      const target = yield* validateStateToken<DefinitionValue>(
        stateTokens,
        readDataProperty(value, "target"),
        [...redirectPath, "target"],
      );
      compiled.push({ when, target });
    }
    return compiled;
  });

const compileTimer = <DefinitionValue extends MachineDefinition>(
  timer: Timer<DefinitionValue>,
  path: Diagnostic.Path,
): CompileResult<CompiledTimer<DefinitionValue>> => {
  if (!Number.isFinite(timer.delay) || timer.delay < 0)
    return invalidTimerDelay([...path, "delay"]);
  for (const key of Object.keys(timer)) {
    if (key === "actions") return invalidConfigurationKey("ForbiddenTimerActions", path, key);
    if (!["delay", "guard", "target", "updateMemory"].some((name) => name === key))
      return invalidConfigurationKey("ExtraTimerKey", path, key);
  }
  return Result.succeed({
    delay: timer.delay,
    target: timer.target,
    ...(timer.guard === undefined ? {} : { guard: timer.guard }),
    ...(timer.updateMemory === undefined ? {} : { updateMemory: timer.updateMemory }),
  } satisfies CompiledTimer<DefinitionValue>);
};

const compileActivities = <DefinitionValue extends MachineDefinition>(
  behavior: MachineStateBehavior<DefinitionValue>,
): CompiledState<DefinitionValue>["activities"] => {
  const activities: Record<string, MachineActivity> = Object.create(null);
  if (behavior.activities === undefined) return activities;
  for (const [name, value] of Object.entries(behavior.activities)) activities[name] = value;
  return activities;
};

const compileTimers = <DefinitionValue extends MachineDefinition>(
  behavior: MachineStateBehavior<DefinitionValue>,
  path: StatePath,
): CompileResult<CompiledState<DefinitionValue>["timers"]> => {
  const timers: Record<string, CompiledTimer<DefinitionValue>> = Object.create(null);
  if (behavior.timers === undefined) return Result.succeed(timers);
  for (const [name, value] of Object.entries(behavior.timers)) {
    const timer = compileTimer(value, [...configurationPath(path, ["timers", name])]);
    if (Result.isFailure(timer)) return Result.fail(timer.failure);
    timers[name] = timer.success;
  }
  return Result.succeed(timers);
};

const compileBehavior = <DefinitionValue extends MachineDefinition>(
  behavior: MachineStateBehavior<DefinitionValue>,
  path: StatePath,
  stateTokens: ReadonlySet<object>,
): CompileResult<
  Pick<CompiledState<DefinitionValue>, "handlers" | "redirects" | "activities" | "timers">
> =>
  Result.gen(function* () {
    return {
      handlers: yield* compileHandlers(behavior, path, stateTokens),
      redirects: yield* compileRedirects(behavior, path, stateTokens),
      activities: compileActivities(behavior),
      timers: yield* compileTimers(behavior, path),
    };
  });

const compileState = <DefinitionValue extends MachineDefinition>(
  node: StateMetadata,
  configuration: unknown,
  inheritedHandlers: ReadonlySet<string>,
  states: Record<string, CompiledState<DefinitionValue>>,
  stateTokens: ReadonlySet<object>,
): CompileResult<void> =>
  Result.gen(function* () {
    if (!isConfigurationRecord<DefinitionValue>(configuration))
      return yield* invalidConfiguration("ExpectedStateConfiguration", configurationPath(node.path, []));
    const allowedKeys =
      node.token === undefined
        ? ["default", "states", "on", "redirect", "activities", "timers"]
        : ["on", "redirect", "activities", "timers"];
    yield* validateExactDataKeys(
      configuration,
      configurationPath(node.path, []),
      allowedKeys,
      "ExtraStateConfigurationKey",
    );

    const ownHandlers = yield* collectOwnHandlers(node, configuration, inheritedHandlers);
    const behavior = yield* compileBehavior(configuration, node.path, stateTokens);

    const nextInheritedHandlers = new Set(inheritedHandlers);
    for (const name of ownHandlers) nextInheritedHandlers.add(name);
    if (node.token === undefined) {
      const defaultToken = configuration.default;
      const childConfigurations = configuration.states;
      if (defaultToken === undefined || childConfigurations === undefined)
        return yield* invalidConfiguration(
          "MissingCompoundStateFields",
          configurationPath(node.path, [defaultToken === undefined ? "default" : "states"]),
        );
      const validDefault = yield* validateStateToken<DefinitionValue>(
        stateTokens,
        defaultToken,
        configurationPath(node.path, ["default"]),
      );
      if (!node.children.some((child) => child.token === validDefault))
        return yield* invalidConfiguration(
          "InvalidDefaultTarget",
          configurationPath(node.path, ["default"]),
        );
      if (!isConfigurationRecord<DefinitionValue>(childConfigurations))
        return yield* invalidConfiguration(
          "InvalidCompoundState",
          configurationPath(node.path, ["states"]),
        );

      yield* validateExactDataKeys(
        childConfigurations,
        configurationPath(node.path, ["states"]),
        node.children.map((child) => child.name),
        "ExtraStateConfigurationKey",
      );

      states[stateKey(node.path)] = {
        path: stateDisplayPath(node.path),
        kind: "compound",
        default: validDefault,
        children: node.children.map((child) => stateKey(child.path)),
        ...behavior,
      };

      for (const child of node.children) {
        if (!Object.hasOwn(childConfigurations, child.name))
          return yield* invalidConfiguration(
            "MissingCompoundStateFields",
            configurationPath(node.path, ["states", child.name]),
          );
        const childConfiguration = readDataProperty<unknown>(childConfigurations, child.name);
        yield* compileState(child, childConfiguration, nextInheritedHandlers, states, stateTokens);
      }
      return;
    }

    states[stateKey(node.path)] = {
      path: stateDisplayPath(node.path),
      kind: "leaf",
      state: node.token,
      children: [],
      ...behavior,
    };
  });

export const compileMachine = <
  DefinitionValue extends MachineDefinition,
  Configuration extends MachineNodeConfiguration<DefinitionValue>,
>(
  definition: DefinitionValue,
  configuration: Configuration,
  context: readonly ContextRegistration<DefinitionValue>[],
  memory: readonly MemoryRegistration<DefinitionValue>[],
): CompileResult<CompiledMachine<DefinitionValue>> =>
  Result.gen(function* () {
    const metadata = yield* definitionMetadata(definition);
    const stateTokens = new Set<object>();
    collectStateTokens(metadata.states, stateTokens);
    const states: Record<string, CompiledState<DefinitionValue>> = Object.create(null);
    yield* compileState(metadata.states, configuration, new Set(), states, stateTokens);
    return {
      states,
      context: context.map((registration) => ({ ...registration })),
      memory: [...memory],
    };
  });
