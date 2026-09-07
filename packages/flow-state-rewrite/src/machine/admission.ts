import { Effect, Option, Predicate, Result, Schema, SchemaIssue } from "effect";

import type { DefinitionConstraint, StateOf } from "../definition/domain.js";
import type * as Diagnostic from "../diagnostic/diagnostic.js";
import {
  isConstructedOperationPlan,
  isOperationPlanForDescriptor,
} from "../operation/operation.js";
import { invalidMachineConfigurationDiagnostic } from "./diagnostic.js";
import {
  captureConfigurationData,
  captureConfigurationEntries,
  type ConfigurationEntry,
} from "./configuration-data.js";
import type {
  CompiledState,
  CompiledTimer,
  CompiledTransition,
  EventName,
  MachineActivity,
  MachineDefinition,
  Redirect,
  StateNode,
  Timer,
} from "./grammar.js";
import {
  readArrayValues,
  readSnapshotProperty,
  readTokenText,
  snapshotRecord,
} from "./reflection.js";
import type { ConfigurationSnapshot } from "./reflection.js";

/*
 * Admission:
 *
 * Shared capture and failure projection
 * State configuration
 * Timers
 * Transitions
 * Event handlers
 * Redirects
 * Activities
 *
 * Assembly:
 *   admitStateBehavior
 *
 * Each component keeps its schema, resolved type, diagnostic projector
 * and admission function together. Validation order remains explicit.
 */

type TargetValidator<Target> = (
  value: unknown,
  path: Diagnostic.Path,
) => Result.Result<Target, Diagnostic.PublicDiagnostic>;

type MachineReason = Parameters<typeof invalidMachineConfigurationDiagnostic>[0];

export const configurationPath = (path: readonly string[], suffix: readonly (string | number)[]) =>
  path.flatMap<string | number>((segment) => ["states", segment]).concat(suffix);

// RETURN_TYPE: Predicate return preserves callable narrowing for callback schemas.
const isCallable = (value: unknown): value is (...arguments_: never[]) => void =>
  Predicate.isFunction(value);

const nestedSchemaIssue = (issue: SchemaIssue.Issue) => {
  if ("issue" in issue) return issue.issue;
  if ("issues" in issue) return issue.issues[0];
  return undefined;
};

const firstSchemaFailure = (issue: SchemaIssue.Issue) => {
  let current = issue;
  const path: PropertyKey[] = [];

  // oxlint-disable-next-line typescript/no-unnecessary-condition -- traversal terminates only after an issue has no nested child.
  while (true) {
    if (current._tag === "Pointer") path.push(...current.path);

    const nested = nestedSchemaIssue(current);
    if (nested === undefined) return { issue: current, path };

    current = nested;
  }
};

// RETURN_TYPE: Fixes admission failures to the shared never-success Diagnostic channel.
export const invalidConfiguration = (
  reason: MachineReason,
  path: Diagnostic.Path,
  ...details: readonly [] | readonly [Diagnostic.Details]
): Result.Result<never, Diagnostic.PublicDiagnostic> =>
  Result.fail(
    invalidMachineConfigurationDiagnostic(reason, path, details.length === 0 ? {} : details[0]),
  );

// State configuration

const inaccessibleStateProperty = Symbol("inaccessible state property");
const stateConfigurationSchema = Schema.Struct({
  default: Schema.optional(Schema.Unknown),
  states: Schema.optional(Schema.Unknown),
  on: Schema.optional(Schema.Unknown),
  redirect: Schema.optional(Schema.Unknown),
  activities: Schema.optional(Schema.Unknown),
  timers: Schema.optional(Schema.Unknown),
});
const decodeStateConfigurationFields = Schema.decodeUnknownResult(stateConfigurationSchema, {
  onExcessProperty: "error",
});

type StateConfigurationFields = typeof stateConfigurationSchema.Type;

export type StateBehaviorConfiguration = Pick<
  StateConfigurationFields,
  "on" | "redirect" | "activities" | "timers"
>;

export type LeafStateConfiguration = {
  readonly kind: "leaf";
  readonly behavior: StateBehaviorConfiguration;
};

export type CompoundStateConfiguration = {
  readonly kind: "compound";
  readonly default: unknown;
  readonly children: ReadonlyMap<string, unknown>;
  readonly behavior: StateBehaviorConfiguration;
};

export type StateConfigurationAdmission = LeafStateConfiguration | CompoundStateConfiguration;

const projectStateConfigurationSchemaFailure = (
  failure: Schema.SchemaError,
  path: Diagnostic.Path,
) => {
  const { issue, path: issuePath } = firstSchemaFailure(failure.issue);
  if (issue instanceof MachineAdmissionIssue) return Result.fail(issue.diagnostic);
  const field = issuePath[0];
  if (issue._tag === "UnexpectedKey" && field !== undefined)
    return invalidConfiguration("UnexpectedConfigurationField", [...path, String(field)], {
      key: String(field),
    });
  return invalidConfiguration("ExpectedStateConfiguration", path);
};

const admitStateChildren = (
  snapshot: ConfigurationSnapshot,
  children: readonly StateNode[],
  path: Diagnostic.Path,
) => {
  const childNames = new Set(children.map((child) => child.name));
  const values = new Map<string, unknown>();
  const entries = captureConfigurationEntries(snapshot, inaccessibleStateProperty);
  if (Result.isFailure(entries))
    return invalidConfiguration(entries.failure.reason, [...path, String(entries.failure.key)], {
      key: String(entries.failure.key),
    });

  for (const [key, value] of entries.success) {
    if (!childNames.has(key))
      return invalidConfiguration("StateConfigurationMismatch", [...path, key], { key });
    if (value === inaccessibleStateProperty)
      return invalidConfiguration("MissingCompoundStateFields", [...path, key]);
    values.set(key, value);
  }
  const missing = children.find((child) => !values.has(child.name));
  return missing === undefined
    ? Result.succeed(values)
    : invalidConfiguration("StateConfigurationMismatch", [...path, missing.name], {
        key: missing.name,
      });
};

const makeStateConfigurationSchema = <DefinitionValue extends DefinitionConstraint>(
  node: StateNode<DefinitionValue>,
  path: Diagnostic.Path,
) =>
  Schema.declareConstructor<StateConfigurationAdmission, unknown>()(
    [],
    () => (input, ast, options) => {
      const result = Result.gen(function* () {
        const snapshot = yield* snapshotRecord(
          input,
          path,
          path.length === 0 ? "ConfigurationNotRecord" : "ExpectedStateConfiguration",
        );
        const captured = yield* captureConfigurationData(snapshot, path, inaccessibleStateProperty);
        const decoded = decodeStateConfigurationFields(captured);
        if (Result.isFailure(decoded))
          return yield* projectStateConfigurationSchemaFailure(decoded.failure, path);

        const behavior = {
          on: decoded.success.on,
          redirect: decoded.success.redirect,
          activities: decoded.success.activities,
          timers: decoded.success.timers,
        } satisfies StateBehaviorConfiguration;

        if (node.kind === "leaf") {
          let field: "default" | "states" | undefined;
          if (Object.hasOwn(decoded.success, "default")) field = "default";
          else if (Object.hasOwn(decoded.success, "states")) field = "states";
          if (field !== undefined)
            return yield* invalidConfiguration("ExpectedLeafConfiguration", [...path, field], {
              field,
            });
          return { kind: "leaf", behavior } satisfies LeafStateConfiguration;
        }

        if (
          !Object.hasOwn(decoded.success, "default") ||
          decoded.success.default === undefined ||
          decoded.success.default === inaccessibleStateProperty
        )
          return yield* invalidConfiguration("MissingCompoundStateFields", [...path, "default"]);
        if (
          !Object.hasOwn(decoded.success, "states") ||
          decoded.success.states === undefined ||
          decoded.success.states === inaccessibleStateProperty
        )
          return yield* invalidConfiguration("MissingCompoundStateFields", [...path, "states"]);

        const statesPath = [...path, "states"];
        const children = yield* snapshotRecord(
          decoded.success.states,
          statesPath,
          "InvalidCompoundState",
        );
        const childValues = yield* admitStateChildren(children, node.children, statesPath);
        return {
          kind: "compound",
          default: decoded.success.default,
          children: childValues,
          behavior,
        } satisfies CompoundStateConfiguration;
      });
      return Effect.fromResult(result).pipe(
        Effect.mapError((diagnostic) => new MachineAdmissionIssue(ast, input, options, diagnostic)),
      );
    },
  );

export function admitStateConfiguration<DefinitionValue extends DefinitionConstraint>(
  value: unknown,
  path: Diagnostic.Path,
  node: StateNode<DefinitionValue> & { readonly kind: "leaf" },
): Result.Result<LeafStateConfiguration, Diagnostic.PublicDiagnostic>;
export function admitStateConfiguration<DefinitionValue extends DefinitionConstraint>(
  value: unknown,
  path: Diagnostic.Path,
  node: StateNode<DefinitionValue> & { readonly kind: "compound" },
): Result.Result<CompoundStateConfiguration, Diagnostic.PublicDiagnostic>;
// RETURN_TYPE: Preserves overload compatibility between leaf and compound state configuration admission; removal produces TS2394.
export function admitStateConfiguration<DefinitionValue extends DefinitionConstraint>(
  value: unknown,
  path: Diagnostic.Path,
  node: StateNode<DefinitionValue>,
): Result.Result<StateConfigurationAdmission, Diagnostic.PublicDiagnostic> {
  const decoded = Schema.decodeUnknownResult(makeStateConfigurationSchema(node, path))(value);
  if (Result.isSuccess(decoded)) return Result.succeed(decoded.success);
  return projectStateConfigurationSchemaFailure(decoded.failure, path);
}

// Timers

const inaccessibleTimerProperty = Symbol("inaccessible timer property");
const TimerDelay = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0));

type TimerGuard<DefinitionValue extends MachineDefinition> = NonNullable<
  CompiledTimer<DefinitionValue>["guard"]
>;

type TimerUpdateMemory<DefinitionValue extends MachineDefinition> = NonNullable<
  CompiledTimer<DefinitionValue>["updateMemory"]
>;

type AdmittedTimer<DefinitionValue extends MachineDefinition> = {
  delay: number;
  target: Timer<DefinitionValue>["target"];
  guard?: TimerGuard<DefinitionValue>;
  updateMemory?: TimerUpdateMemory<DefinitionValue>;
};

const timerGuardSchema = <DefinitionValue extends MachineDefinition>() =>
  Schema.declare<TimerGuard<DefinitionValue>>(
    // RETURN_TYPE: Preserves TimerGuard narrowing required by Schema.declare; removal produces TS2345.
    (value): value is TimerGuard<DefinitionValue> => isCallable(value),
    { identifier: "TimerGuard" },
  );

const timerUpdateMemorySchema = <DefinitionValue extends MachineDefinition>() =>
  Schema.declare<TimerUpdateMemory<DefinitionValue>>(
    // RETURN_TYPE: Preserves TimerUpdateMemory narrowing required by Schema.declare; removal produces TS2345.
    (value): value is TimerUpdateMemory<DefinitionValue> => isCallable(value),
    { identifier: "TimerUpdateMemory" },
  );

const timerSchema = Schema.Struct({
  delay: TimerDelay,
  target: Schema.Unknown,
  guard: Schema.optional(Schema.Unknown),
  updateMemory: Schema.optional(Schema.Unknown),
});

type RawTimerConfiguration = typeof timerSchema.Type;
const decodeTimerFields = Schema.decodeUnknownResult(timerSchema, {
  onExcessProperty: "error",
});

const decodeTimerGuard = <DefinitionValue extends MachineDefinition>(value: unknown) =>
  Schema.decodeUnknownResult(timerGuardSchema<DefinitionValue>())(value);

const decodeTimerUpdateMemory = <DefinitionValue extends MachineDefinition>(value: unknown) =>
  Schema.decodeUnknownResult(timerUpdateMemorySchema<DefinitionValue>())(value);

const projectTimerSchemaFailure = (failure: Schema.SchemaError, path: Diagnostic.Path) => {
  const { issue, path: issuePath } = firstSchemaFailure(failure.issue);
  if (issue instanceof MachineAdmissionIssue) return Result.fail(issue.diagnostic);
  const field = issuePath[0];
  if (issue._tag === "UnexpectedKey" && field !== undefined)
    return invalidConfiguration("UnexpectedConfigurationField", [...path, String(field)], {
      key: String(field),
    });
  if (field === "delay")
    return invalidConfiguration("InvalidTimerDelay", [...path, "delay"], {
      constraint: "finite-non-negative",
    });
  if (field === "target")
    return invalidConfiguration("UnknownEventToken", [...path, "target"], {
      issue: "definition-identity",
    });
  return invalidConfiguration("ExpectedTimer", path);
};

const resolveTimerTarget = <DefinitionValue extends MachineDefinition>(
  value: unknown,
  path: Diagnostic.Path,
  validateTarget: TargetValidator<Timer<DefinitionValue>["target"]>,
) => validateTarget(value, path);

const makeTimerSchema = <DefinitionValue extends MachineDefinition>(
  validateTarget: TargetValidator<Timer<DefinitionValue>["target"]>,
  path: Diagnostic.Path,
) =>
  Schema.declareConstructor<CompiledTimer<DefinitionValue>, unknown>()(
    [],
    () => (input, ast, options) => {
      const result = Result.gen(function* () {
        const snapshot = yield* snapshotRecord(input, path, "ExpectedTimer");
        const captured = yield* captureConfigurationData(snapshot, path, inaccessibleTimerProperty);
        const decoded = decodeTimerFields(captured);
        if (Result.isFailure(decoded))
          return yield* projectTimerSchemaFailure(decoded.failure, path);

        const raw: RawTimerConfiguration = decoded.success;
        const target = yield* resolveTimerTarget(raw.target, [...path, "target"], validateTarget);
        const guard =
          raw.guard === undefined
            ? undefined
            : yield* Result.mapError(decodeTimerGuard<DefinitionValue>(raw.guard), () =>
                invalidMachineConfigurationDiagnostic("ExpectedFunction", [...path, "guard"], {
                  field: "guard",
                }),
              );
        const updateMemory =
          raw.updateMemory === undefined
            ? undefined
            : yield* Result.mapError(
                decodeTimerUpdateMemory<DefinitionValue>(raw.updateMemory),
                () =>
                  invalidMachineConfigurationDiagnostic(
                    "ExpectedFunction",
                    [...path, "updateMemory"],
                    { field: "updateMemory" },
                  ),
              );

        const timer: AdmittedTimer<DefinitionValue> = {
          delay: raw.delay,
          target,
        };
        if (guard !== undefined) timer.guard = guard;
        if (updateMemory !== undefined) timer.updateMemory = updateMemory;
        return timer satisfies CompiledTimer<DefinitionValue>;
      });
      return Effect.fromResult(result).pipe(
        Effect.mapError((diagnostic) => new MachineAdmissionIssue(ast, input, options, diagnostic)),
      );
    },
  );

export const admitTimer = <DefinitionValue extends MachineDefinition>(
  value: unknown,
  path: Diagnostic.Path,
  validateTarget: TargetValidator<Timer<DefinitionValue>["target"]>,
) => {
  const decoded = Schema.decodeUnknownResult(makeTimerSchema(validateTarget, path))(value);
  if (Result.isSuccess(decoded)) return Result.succeed(decoded.success);
  return projectTimerSchemaFailure(decoded.failure, path);
};

const admitTimers = <DefinitionValue extends MachineDefinition>(
  behavior: StateBehaviorConfiguration,
  path: readonly string[],
  validateTarget: TargetValidator<Timer<DefinitionValue>["target"]>,
) =>
  Result.gen(function* () {
    const configured = yield* admitBehaviorMap("timers", behavior.timers, path, "ExpectedTimer");
    const timers: Record<string, Timer<DefinitionValue>> = Object.create(null);
    const timersPath = configurationPath(path, ["timers"]);
    for (const [key, value] of configured) {
      timers[key] = yield* admitTimer<DefinitionValue>(
        value === inaccessibleBehaviorEntry ? undefined : value,
        [...timersPath, key],
        validateTarget,
      );
    }
    return timers;
  });

// Transitions

const inaccessibleTransitionProperty = Symbol("inaccessible transition property");

type InvalidTypeArguments = ConstructorParameters<typeof SchemaIssue.InvalidType>;

/*
 * Custom Schema decoders can expose only SchemaIssue.Issue. This machine-local
 * carrier preserves the exact semantic Diagnostic object across that boundary
 * so the outer projector does not recreate or relabel it.
 */
class MachineAdmissionIssue extends SchemaIssue.InvalidType {
  constructor(
    ast: InvalidTypeArguments[0],
    value: InvalidTypeArguments[1],
    options: InvalidTypeArguments[2],
    readonly diagnostic: Diagnostic.PublicDiagnostic,
  ) {
    super(ast, value, options);
  }
}

type TransitionGuard<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
> = NonNullable<CompiledTransition<DefinitionValue, Name>["guard"]>;

type TransitionUpdateMemory<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
> = NonNullable<CompiledTransition<DefinitionValue, Name>["updateMemory"]>;

type TransitionActions<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
> = NonNullable<CompiledTransition<DefinitionValue, Name>["actions"]>;

type ResolvedTransitionConfiguration<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
> = {
  target: StateOf<DefinitionValue>;
  guard?: TransitionGuard<DefinitionValue, Name>;
  updateMemory?: TransitionUpdateMemory<DefinitionValue, Name>;
  actions?: TransitionActions<DefinitionValue, Name>;
};

const transitionGuardSchema = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>() =>
  Schema.declare<TransitionGuard<DefinitionValue, Name>>(
    // RETURN_TYPE: Preserves TransitionGuard narrowing required by Schema.declare; removal produces TS2345.
    (value): value is TransitionGuard<DefinitionValue, Name> => isCallable(value),
    { identifier: "TransitionGuard" },
  );

const transitionUpdateMemorySchema = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>() =>
  Schema.declare<TransitionUpdateMemory<DefinitionValue, Name>>(
    // RETURN_TYPE: Preserves TransitionUpdateMemory narrowing required by Schema.declare; removal produces TS2345.
    (value): value is TransitionUpdateMemory<DefinitionValue, Name> => isCallable(value),
    { identifier: "TransitionUpdateMemory" },
  );

const transitionActionsSchema = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>() =>
  Schema.declare<TransitionActions<DefinitionValue, Name>>(
    // RETURN_TYPE: Preserves TransitionActions narrowing required by Schema.declare; removal produces TS2345.
    (value): value is TransitionActions<DefinitionValue, Name> => isCallable(value),
    { identifier: "TransitionActions" },
  );

const transitionSchema = Schema.Struct({
  target: Schema.Unknown,
  guard: Schema.optional(Schema.Unknown),
  updateMemory: Schema.optional(Schema.Unknown),
  actions: Schema.optional(Schema.Unknown),
  reenter: Schema.optional(Schema.Unknown),
});

const decodeTransitionFields = Schema.decodeUnknownResult(transitionSchema, {
  onExcessProperty: "error",
});

const projectTransitionSchemaFailure = (failure: Schema.SchemaError, path: Diagnostic.Path) => {
  const { issue, path: issuePath } = firstSchemaFailure(failure.issue);
  if (issue instanceof MachineAdmissionIssue) return Result.fail(issue.diagnostic);
  const field = issuePath[0];
  if (issue._tag === "UnexpectedKey" && field !== undefined)
    return invalidConfiguration("UnexpectedConfigurationField", [...path, String(field)], {
      key: String(field),
    });
  if (issue._tag === "MissingKey" && field === "target")
    return invalidConfiguration("TransitionObjectRequired", path);
  return invalidConfiguration("ExpectedTransition", path);
};

const decodeTransitionGuard = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  value: unknown,
  path: Diagnostic.Path,
) =>
  Result.mapError(
    Schema.decodeUnknownResult(transitionGuardSchema<DefinitionValue, Name>())(value),
    () => invalidMachineConfigurationDiagnostic("ExpectedFunction", path, { field: "guard" }),
  );

const decodeTransitionUpdateMemory = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  value: unknown,
  path: Diagnostic.Path,
) =>
  Result.mapError(
    Schema.decodeUnknownResult(transitionUpdateMemorySchema<DefinitionValue, Name>())(value),
    () =>
      invalidMachineConfigurationDiagnostic("ExpectedFunction", path, { field: "updateMemory" }),
  );

const decodeTransitionActions = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  value: unknown,
  path: Diagnostic.Path,
) =>
  Result.mapError(
    Schema.decodeUnknownResult(transitionActionsSchema<DefinitionValue, Name>())(value),
    () => invalidMachineConfigurationDiagnostic("ExpectedFunction", path, { field: "actions" }),
  );

const makeTransitionSchema = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  validateTarget: TargetValidator<StateOf<DefinitionValue>>,
  path: Diagnostic.Path,
) =>
  Schema.declareConstructor<CompiledTransition<DefinitionValue, Name>, unknown>()(
    [],
    () => (input, ast, options) => {
      const result = Result.gen(function* () {
        const snapshot = yield* snapshotRecord(input, path, "ExpectedTransition");
        const kind = readSnapshotProperty(snapshot, "kind");
        if (kind.kind === "data" && kind.value === "state")
          return yield* invalidConfiguration("InvalidStateToken", path, {
            issue: "definition-identity",
          });

        const captured = yield* captureConfigurationData(
          snapshot,
          path,
          inaccessibleTransitionProperty,
        );
        const decoded = decodeTransitionFields(captured);
        if (Result.isFailure(decoded))
          return yield* projectTransitionSchemaFailure(decoded.failure, path);

        const raw = decoded.success;
        const target = yield* validateTarget(raw.target, [...path, "target"]);
        const guard =
          raw.guard === undefined
            ? undefined
            : yield* decodeTransitionGuard<DefinitionValue, Name>(raw.guard, [...path, "guard"]);
        const updateMemory =
          raw.updateMemory === undefined
            ? undefined
            : yield* decodeTransitionUpdateMemory<DefinitionValue, Name>(raw.updateMemory, [
                ...path,
                "updateMemory",
              ]);
        const actions =
          raw.actions === undefined
            ? undefined
            : yield* decodeTransitionActions<DefinitionValue, Name>(raw.actions, [
                ...path,
                "actions",
              ]);
        const resolved: ResolvedTransitionConfiguration<DefinitionValue, Name> = { target };
        if (guard !== undefined) resolved.guard = guard;
        if (updateMemory !== undefined) resolved.updateMemory = updateMemory;
        if (actions !== undefined) resolved.actions = actions;
        if (raw.reenter === undefined)
          return resolved satisfies CompiledTransition<DefinitionValue, Name>;

        const reenter = yield* validateTarget(raw.reenter, [...path, "reenter"]);
        return { ...resolved, reenter } satisfies CompiledTransition<DefinitionValue, Name>;
      });
      return Effect.fromResult(result).pipe(
        Effect.mapError((diagnostic) => new MachineAdmissionIssue(ast, input, options, diagnostic)),
      );
    },
  );

// RETURN_TYPE: Preserves event-specific callback correlations through Schema decoding and failure projection.
export const admitTransition = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  value: unknown,
  path: Diagnostic.Path,
  validateTarget: TargetValidator<StateOf<DefinitionValue>>,
): Result.Result<CompiledTransition<DefinitionValue, Name>, Diagnostic.PublicDiagnostic> => {
  const decoded = Schema.decodeUnknownResult(
    makeTransitionSchema<DefinitionValue, Name>(validateTarget, path),
  )(value);
  if (Result.isSuccess(decoded)) return Result.succeed(decoded.success);
  return projectTransitionSchemaFailure(decoded.failure, path);
};

// Event handlers

const inaccessibleBehaviorEntry = Symbol("inaccessible behavior entry");

// RETURN_TYPE: Preserves the behavior-map entry shape while its snapshot is decoded later.
const admitBehaviorMap = (
  field: "on" | "activities" | "timers",
  value: unknown,
  path: readonly string[],
  reason: "ExpectedEventHandlers" | "ExpectedActivities" | "ExpectedTimer",
): Result.Result<ConfigurationEntry[], Diagnostic.PublicDiagnostic> => {
  const fieldPath = configurationPath(path, [field]);
  if (value === undefined) return Result.succeed([]);
  if (value === inaccessibleStateProperty) return invalidConfiguration(reason, fieldPath);
  return Result.gen(function* () {
    const snapshot = yield* snapshotRecord(value, fieldPath, reason);
    const entries = captureConfigurationEntries(snapshot, inaccessibleBehaviorEntry);
    if (Result.isFailure(entries))
      return yield* invalidConfiguration(
        entries.failure.reason,
        [...fieldPath, String(entries.failure.key)],
        { key: String(entries.failure.key) },
      );
    return entries.success;
  });
};

// RETURN_TYPE: Predicate return preserves event-name narrowing for typed handler admission.
const isEventName = <DefinitionValue extends MachineDefinition>(
  events: DefinitionValue["E"],
  value: string,
): value is EventName<DefinitionValue> => Object.prototype.propertyIsEnumerable.call(events, value);

const isStateToken = (value: unknown) => {
  const kind = readTokenText(value, "kind");
  const id = readTokenText(value, "id");
  return (
    Result.isSuccess(kind) &&
    Result.isSuccess(id) &&
    ((Option.isSome(kind.success) && kind.success.value === "state") ||
      (Option.isNone(kind.success) && Option.isSome(id.success)))
  );
};

// RETURN_TYPE: Preserves the generic CompiledTransition success channel for handler admission.
const admitEventHandlerTransition = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  value: unknown,
  path: Diagnostic.Path,
  validateStateToken: TargetValidator<StateOf<DefinitionValue>>,
): Result.Result<CompiledTransition<DefinitionValue, Name>, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    if (isStateToken(value)) {
      const target = yield* validateStateToken(value, path);
      return { target };
    }
    return yield* admitTransition<DefinitionValue, Name>(value, path, validateStateToken);
  });

const makeHandlerEntrySchema = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  validateStateToken: TargetValidator<StateOf<DefinitionValue>>,
  path: Diagnostic.Path,
) =>
  Schema.declareConstructor<CompiledTransition<DefinitionValue, Name>[], unknown>()(
    [],
    () => (input, ast, options) => {
      const result = Result.gen(function* () {
        const values = yield* readArrayValues(input, path, "ExpectedTransition");
        if (values === undefined) {
          return [
            yield* admitEventHandlerTransition<DefinitionValue, Name>(
              input,
              path,
              validateStateToken,
            ),
          ];
        }

        const eventHandlerListSchema = Schema.NonEmptyArray(Schema.Unknown);
        const decoded = Schema.decodeUnknownResult(eventHandlerListSchema)(values);
        if (!Result.isSuccess(decoded))
          return yield* invalidConfiguration("EmptyEventHandlerList", path);

        const transitions: CompiledTransition<DefinitionValue, Name>[] = [];
        for (const [index, value] of values.entries()) {
          transitions.push(
            yield* admitEventHandlerTransition<DefinitionValue, Name>(
              value,
              [...path, index],
              validateStateToken,
            ),
          );
        }
        return transitions;
      });
      return Effect.fromResult(result).pipe(
        Effect.mapError((diagnostic) => new MachineAdmissionIssue(ast, input, options, diagnostic)),
      );
    },
  );

const projectEventHandlerSchemaFailure = (failure: Schema.SchemaError, path: Diagnostic.Path) => {
  const { issue, path: issuePath } = firstSchemaFailure(failure.issue);
  if (issue instanceof MachineAdmissionIssue) return Result.fail(issue.diagnostic);
  const field = issuePath[0];
  if (issue._tag === "UnexpectedKey" && field !== undefined)
    return invalidConfiguration("UnexpectedConfigurationField", [...path, String(field)], {
      key: String(field),
    });
  return invalidConfiguration("ExpectedTransition", path);
};

// RETURN_TYPE: Preserves the event-specific transition array after schema admission and projection.
const admitEventHandlerEntry = <
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
>(
  value: unknown,
  path: Diagnostic.Path,
  validateStateToken: TargetValidator<StateOf<DefinitionValue>>,
): Result.Result<CompiledTransition<DefinitionValue, Name>[], Diagnostic.PublicDiagnostic> => {
  const decoded = Schema.decodeUnknownResult(
    makeHandlerEntrySchema<DefinitionValue, Name>(validateStateToken, path),
  )(value);
  if (Result.isSuccess(decoded)) return Result.succeed(decoded.success);
  return projectEventHandlerSchemaFailure(decoded.failure, path);
};

// RETURN_TYPE: Publishes the event-specific readonly transition arrays required by CompiledState.
export const admitEventHandlers = <DefinitionValue extends MachineDefinition>(
  behavior: StateBehaviorConfiguration,
  path: readonly string[],
  events: DefinitionValue["E"],
  inheritedHandlers: ReadonlySet<string>,
  validateStateToken: TargetValidator<StateOf<DefinitionValue>>,
): Result.Result<CompiledState<DefinitionValue>["handlers"], Diagnostic.PublicDiagnostic> => {
  const handlers: CompiledState<DefinitionValue>["handlers"] = Object.create(null);
  return Result.gen(function* () {
    const on = yield* admitBehaviorMap("on", behavior.on, path, "ExpectedEventHandlers");
    const onPath = configurationPath(path, ["on"]);
    for (const [key, value] of on) {
      if (!isEventName<DefinitionValue>(events, key))
        return yield* invalidConfiguration("UnknownEventHandler", [...onPath, key], {
          event: key,
        });
      if (inheritedHandlers.has(key))
        return yield* invalidConfiguration("AmbiguousHandler", configurationPath(path, []), {
          event: key,
        });
      const entry = yield* admitEventHandlerEntry<DefinitionValue, typeof key>(
        value === inaccessibleBehaviorEntry ? undefined : value,
        [...onPath, key],
        validateStateToken,
      );
      Object.assign(handlers, { [key]: entry });
    }
    return handlers;
  });
};

// Redirects

const inaccessibleRedirectProperty = Symbol("inaccessible redirect property");
const redirectRecordSchema = Schema.Struct({
  when: Schema.Unknown,
  target: Schema.Unknown,
});
const redirectListSchema = Schema.NonEmptyArray(Schema.Unknown);

const redirectCallbackSchema = <DefinitionValue extends MachineDefinition>() =>
  // SAFETY: the callback type is inherited from the typed Machine grammar; this declaration only adds the runtime callability check.
  Schema.declare<Redirect<DefinitionValue>["when"]>(
    // RETURN_TYPE: Preserves Redirect<DefinitionValue>["when"] narrowing required by Schema.declare; removal produces TS2345.
    (value): value is Redirect<DefinitionValue>["when"] => isCallable(value),
    { identifier: "RedirectWhen" },
  );

type RawRedirectRecord = typeof redirectRecordSchema.Type;

// RETURN_TYPE: Keeps schema projection failures in the never-success Diagnostic channel.
const projectRedirectRecordSchemaFailure = (
  failure: Schema.SchemaError,
  path: Diagnostic.Path,
): Result.Result<never, Diagnostic.PublicDiagnostic> => {
  const { issue, path: issuePath } = firstSchemaFailure(failure.issue);
  if (issue instanceof MachineAdmissionIssue) return Result.fail(issue.diagnostic);
  const field = issuePath[0];
  if (issue._tag === "UnexpectedKey" && field !== undefined)
    return invalidConfiguration("UnexpectedConfigurationField", [...path, String(field)], {
      key: String(field),
    });
  if (issue._tag !== "MissingKey" && field === "when")
    return invalidConfiguration("ExpectedFunction", [...path, "when"], { field: "when" });
  return invalidConfiguration("ExpectedRedirect", path);
};

// RETURN_TYPE: Keeps reflected redirect data opaque until redirectRecordSchema decodes it.
const captureRedirectRecord = (
  value: unknown,
  path: Diagnostic.Path,
): Result.Result<unknown, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const snapshot = yield* snapshotRecord(value, path, "ExpectedRedirect");
    return yield* captureConfigurationData(snapshot, path, inaccessibleRedirectProperty);
  });

// RETURN_TYPE: Preserves the raw redirect record produced by structural admission.
const admitRedirectRecord = (
  value: unknown,
  path: Diagnostic.Path,
): Result.Result<RawRedirectRecord, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const captured = yield* captureRedirectRecord(value, path);
    const decoded = Schema.decodeUnknownResult(redirectRecordSchema, {
      onExcessProperty: "error",
    })(captured);
    if (!Result.isSuccess(decoded))
      return yield* projectRedirectRecordSchemaFailure(decoded.failure, path);
    return decoded.success;
  });

// RETURN_TYPE: Publishes each redirect with its definition-specific target and callback types.
const admitRedirectEntry = <DefinitionValue extends MachineDefinition>(
  record: RawRedirectRecord,
  path: Diagnostic.Path,
  validateTarget: TargetValidator<StateOf<DefinitionValue>>,
): Result.Result<Redirect<DefinitionValue>, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const decodedWhen = Schema.decodeUnknownResult(redirectCallbackSchema<DefinitionValue>())(
      record.when,
    );
    if (!Result.isSuccess(decodedWhen))
      return yield* invalidConfiguration("ExpectedFunction", [...path, "when"], {
        field: "when",
      });

    const target = yield* validateTarget(record.target, [...path, "target"]);

    return {
      when: decodedWhen.success,
      target,
    } satisfies Redirect<DefinitionValue>;
  });

const makeRedirectSchema = <DefinitionValue extends MachineDefinition>(
  validateTarget: TargetValidator<StateOf<DefinitionValue>>,
  path: Diagnostic.Path,
) =>
  Schema.declareConstructor<Redirect<DefinitionValue>[], unknown>()(
    [],
    () => (input, ast, options) => {
      const result = Result.gen(function* () {
        const values = yield* readArrayValues(input, path, "ExpectedRedirect");
        if (values === undefined) {
          const record = yield* admitRedirectRecord(input, path);
          return [yield* admitRedirectEntry(record, path, validateTarget)];
        }

        const decoded = Schema.decodeUnknownResult(redirectListSchema, {
          onExcessProperty: "error",
        })(values);
        if (!Result.isSuccess(decoded))
          return yield* invalidConfiguration("EmptyRedirectList", path);

        const records: RawRedirectRecord[] = [];
        for (const [index, value] of values.entries())
          records.push(yield* admitRedirectRecord(value, [...path, index]));

        const redirects: Redirect<DefinitionValue>[] = [];
        for (const [index, record] of records.entries())
          redirects.push(
            yield* admitRedirectEntry<DefinitionValue>(record, [...path, index], validateTarget),
          );
        return redirects;
      });
      return Effect.fromResult(result).pipe(
        Effect.mapError((diagnostic) => new MachineAdmissionIssue(ast, input, options, diagnostic)),
      );
    },
  );

export const admitRedirectConfiguration = <DefinitionValue extends MachineDefinition>(
  value: unknown,
  path: Diagnostic.Path,
  validateTarget: TargetValidator<StateOf<DefinitionValue>>,
) => {
  const decoded = Schema.decodeUnknownResult(
    makeRedirectSchema<DefinitionValue>(validateTarget, path),
  )(value);
  return Result.isSuccess(decoded)
    ? Result.succeed(decoded.success)
    : projectRedirectRecordSchemaFailure(decoded.failure, path);
};

// Activities

type ActivityPlanDecoder<DefinitionValue extends MachineDefinition> = (
  value: unknown,
) => Result.Result<MachineActivity<DefinitionValue>, Schema.SchemaError>;

const activityPlanSchema = <DefinitionValue extends MachineDefinition>(
  operations: DefinitionValue["operations"],
) =>
  Schema.declare(
    // RETURN_TYPE: Preserves MachineActivity<DefinitionValue> narrowing required by Schema.declare; removal produces TS2345 and TS2375.
    (value: unknown): value is MachineActivity<DefinitionValue> => {
      if (!isConstructedOperationPlan(value)) return false;
      if (value.kind !== "resource-subscribe" && value.kind !== "stream-subscribe") return false;
      const operationKind = value.kind === "resource-subscribe" ? "resource" : "stream";
      return Object.values(operations).some(
        (operation) =>
          operation.kind === operationKind &&
          operation.id === value.descriptor &&
          isOperationPlanForDescriptor(value, operation),
      );
    },
    { identifier: "ActivityPlan" },
  );

// RETURN_TYPE: Preserves the generic MachineActivity success channel; direct inference collapses it to never.
const admitActivityPlan = <DefinitionValue extends MachineDefinition>(
  value: unknown,
  path: Diagnostic.Path,
  decodeActivity: ActivityPlanDecoder<DefinitionValue>,
): Result.Result<MachineActivity<DefinitionValue>, Diagnostic.PublicDiagnostic> => {
  const decoded = decodeActivity(value);
  return Result.isSuccess(decoded)
    ? Result.succeed(decoded.success)
    : invalidConfiguration("ExpectedActivities", path);
};

// RETURN_TYPE: Publishes activity admission with the definition-specific operation plan union.
const admitActivities = <DefinitionValue extends MachineDefinition>(
  behavior: StateBehaviorConfiguration,
  path: readonly string[],
  operations: DefinitionValue["operations"],
): Result.Result<Record<string, MachineActivity<DefinitionValue>>, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const configured = yield* admitBehaviorMap(
      "activities",
      behavior.activities,
      path,
      "ExpectedActivities",
    );
    const activities: Record<string, MachineActivity<DefinitionValue>> = Object.create(null);
    const activitiesPath = configurationPath(path, ["activities"]);
    const decodeActivity = Schema.decodeUnknownResult(activityPlanSchema(operations));
    for (const [key, value] of configured) {
      if (value === inaccessibleBehaviorEntry)
        return yield* invalidConfiguration("ExpectedActivities", [...activitiesPath, key]);
      activities[key] = yield* admitActivityPlan<DefinitionValue>(
        value,
        [...activitiesPath, key],
        decodeActivity,
      );
    }
    return activities;
  });

// Assembly

export type AdmittedStateBehavior<DefinitionValue extends MachineDefinition> = Readonly<{
  handlers: CompiledState<DefinitionValue>["handlers"];
  redirects: CompiledState<DefinitionValue>["redirects"];
  activities: CompiledState<DefinitionValue>["activities"];
  timers: CompiledState<DefinitionValue>["timers"];
}>;

export const admitStateBehavior = <DefinitionValue extends MachineDefinition>(
  behavior: StateBehaviorConfiguration,
  path: readonly string[],
  events: DefinitionValue["E"],
  operations: DefinitionValue["operations"],
  inheritedHandlers: ReadonlySet<string>,
  validateStateToken: TargetValidator<StateOf<DefinitionValue>>,
  validateTimerTarget: TargetValidator<Timer<DefinitionValue>["target"]>,
) =>
  Result.gen(function* () {
    const handlers = yield* admitEventHandlers(
      behavior,
      path,
      events,
      inheritedHandlers,
      validateStateToken,
    );
    const redirects =
      behavior.redirect === undefined
        ? []
        : yield* admitRedirectConfiguration(
            behavior.redirect,
            configurationPath(path, ["redirect"]),
            validateStateToken,
          );
    const activities = yield* admitActivities(behavior, path, operations);
    const timers = yield* admitTimers(behavior, path, validateTimerTarget);
    return { handlers, redirects, activities, timers };
  });
