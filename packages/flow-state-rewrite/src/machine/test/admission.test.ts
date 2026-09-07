import { assert, describe, it } from "@effect/vitest";
import { Predicate, Result, Stream } from "effect";

import { definition } from "../../definition/definition.js";
import type * as Diagnostic from "../../diagnostic/diagnostic.js";
import { operationPlan } from "../../operation/operation.js";
import { resource } from "../../operation/resource.js";
import { stream } from "../../operation/stream.js";
import type { InvalidMachineConfigurationReason } from "../diagnostic.js";
import type { MachineConfiguration, MachineDefinition, MachineCallback } from "../grammar.js";
import { machine } from "../machine.js";
import type { Machine } from "../machine.js";
import {
  admitEventHandlers,
  admitRedirectConfiguration,
  admitTimer,
  admitTransition,
  invalidConfiguration,
} from "../admission.js";
import { captureConfigurationData } from "../configuration-data.js";
import { readArrayValues, snapshotRecord } from "../reflection.js";

/*
 * Proof organization:
 *
 * Fixtures and local builders
 * Type relationships and negative authoring cases
 * Behavior suites grouped by observable law
 *
 * Mutable setup remains local to its scenario.
 */

// RETURN_TYPE: Preserves the generic success value extracted by the behavior-proof helper.
const resultSuccess = <Value>(result: Result.Result<Value, Diagnostic.PublicDiagnostic>): Value => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

const NestedResult = definition({
  id: "nested-admission",
  states: ["idle", { active: ["editing", { dialog: ["open", "closed"] }] }],
  events: {
    changed: (value: string) => ({ value }),
    tick: "bare",
  },
});
const Nested = resultSuccess(NestedResult);

type UnknownMachineConstructor = <DefinitionValue extends MachineDefinition>(
  definitionResult: Result.Result<DefinitionValue, Diagnostic.PublicDiagnostic>,
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- invalid configuration is deliberately unknown at this test-only admission seam.
  callback: (input: MachineCallback<DefinitionValue>) => unknown,
) => Result.Result<Machine<DefinitionValue>, Diagnostic.PublicDiagnostic>;

// SAFETY: The real machine implementation performs runtime Result admission; this assignment only exposes it through the unknown-return test seam.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this test-only seam admits unknown invalid configuration callbacks.
const unknownMachine: UnknownMachineConstructor = machine as UnknownMachineConstructor;

const OtherEditorResult = definition({
  id: "other-admission",
  states: ["ready"],
  events: { opened: "bare" },
});
const OtherEditor = resultSuccess(OtherEditorResult);

const ActivityResource = resource({
  id: "nested/activity-resource",
  key: (value: string) => [value] as const,
  lookup: (value: string) => value,
});

const ActivityStream = stream({
  id: "nested/activity-stream",
  key: (value: string) => [value] as const,
  subscribe: (value: string) => Stream.make(value),
});

const ForeignActivityResource = resource({
  id: "foreign/activity-resource",
  key: (value: string) => [value] as const,
  lookup: (value: string) => value,
});

const SameIdForeignActivityResource = resource({
  id: ActivityResource.id,
  key: (value: string) => [value] as const,
  lookup: (value: string) => value,
});

const SameIdForeignActivityStream = stream({
  id: ActivityStream.id,
  key: (value: string) => [value] as const,
  subscribe: (value: string) => Stream.make(value),
});

const ActivityDefinitionResult = definition({
  id: "activity-admission",
  states: ["idle"],
  events: { tick: "bare" },
  operations: { resource: ActivityResource, stream: ActivityStream },
});
const ActivityDefinition = resultSuccess(ActivityDefinitionResult);

const validNestedConfiguration = () => ({
  default: Nested.S.idle,
  states: {
    idle: {},
    active: {
      default: Nested.S.active.S.editing,
      states: {
        editing: {},
        dialog: {
          default: Nested.S.active.S.dialog.S.open,
          states: { open: {}, closed: {} },
        },
      },
    },
  },
});

// RETURN_TYPE: Keeps the assertion helper explicitly void for failure-only behavior proofs.
const assertExactMachineFailure = (
  result: Result.Result<unknown, Diagnostic.PublicDiagnostic>,
  reason: InvalidMachineConfigurationReason,
  path: Diagnostic.Path,
  details: Diagnostic.Details,
): void => {
  if (Result.isSuccess(result)) throw new Error("expected a machine diagnostic");
  assert.strictEqual(result.failure._tag, "Diagnostic");
  assert.strictEqual(result.failure.code, "InvalidMachineConfiguration");
  assert.deepStrictEqual(result.failure.path, path);
  assert.deepStrictEqual(result.failure.details, { ...details, reason });
};

// RETURN_TYPE: Preserves the target identity returned by the test fixture mutator.
const defineOwn = <Value extends Record<never, never>>(
  target: Value,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
): Value => {
  Object.defineProperty(target, key, { configurable: true, enumerable: true, ...descriptor });
  return target;
};

// RETURN_TYPE: Keeps the assertion helper explicitly void for failure-only behavior proofs.
const assertUnknownFailure = (
  configuration: unknown,
  reason: InvalidMachineConfigurationReason,
  path: Diagnostic.Path,
  details: Diagnostic.Details,
): void =>
  assertExactMachineFailure(
    unknownMachine(NestedResult, () => configuration),
    reason,
    path,
    details,
  );

// RETURN_TYPE: Preserves the typed nested configuration fixture accepted by Machine admission.
const withNestedActive = (value: unknown): MachineConfiguration<typeof Nested> => {
  const configuration = validNestedConfiguration();
  defineOwn(configuration.states, "active", { value });
  return configuration;
};

const activityConfiguration = <Value>(value: Value) => {
  const activities = {};
  defineOwn(activities, "service", { value });
  const configuration = {
    default: ActivityDefinition.S.idle,
    states: { idle: {} },
  };
  defineOwn(configuration, "activities", { value: activities });
  return configuration;
};

// RETURN_TYPE: Preserves the typed timer configuration fixture accepted by Machine admission.
const timerWith = (entry: unknown): MachineConfiguration<typeof Nested> => {
  const timers = {};
  defineOwn(timers, "refresh", { value: entry });
  const configuration = validNestedConfiguration();
  defineOwn(configuration, "timers", { value: timers });
  return configuration;
};

// RETURN_TYPE: Preserves the typed transition configuration fixture accepted by Machine admission.
const transitionWith = (entry: unknown): MachineConfiguration<typeof Nested> => {
  const on = {};
  defineOwn(on, "tick", { value: entry });
  const configuration = validNestedConfiguration();
  defineOwn(configuration, "on", { value: on });
  return configuration;
};

// RETURN_TYPE: Preserves the typed redirect configuration fixture accepted by Machine admission.
const redirectWith = (entry: unknown): MachineConfiguration<typeof Nested> => {
  const configuration = validNestedConfiguration();
  defineOwn(configuration, "redirect", { value: entry });
  return configuration;
};

const validTransition = () => ({ target: Nested.S.idle });
const validTimer = () => ({ delay: 1, target: Nested.E.tick });
// RETURN_TYPE: Keeps the assertion helper explicitly void for transition failure proofs.
const assertTransitionFailure = (value: unknown, reason: InvalidMachineConfigurationReason): void =>
  assertUnknownFailure(transitionWith(value), reason, ["on", "tick"], {});
// RETURN_TYPE: Keeps the assertion helper explicitly void for timer failure proofs.
const assertTimerFailure = (value: unknown, reason: InvalidMachineConfigurationReason): void =>
  assertUnknownFailure(timerWith(value), reason, ["timers", "refresh"], {});

type BehaviorField = "on" | "activities" | "timers";

const behaviorMapTarget = (field: BehaviorField) => {
  if (field === "on") return { tick: Nested.S.idle };
  if (field === "activities") return { service: { opaque: true } };
  return { refresh: { delay: 1, target: Nested.E.tick } };
};

const reflectionTraps = [
  {
    getPrototypeOf: () => {
      throw new Error("prototype trap");
    },
  },
  {
    ownKeys: () => {
      throw new Error("keys trap");
    },
  },
  {
    getOwnPropertyDescriptor: () => {
      throw new Error("descriptor trap");
    },
  },
] as const;

describe("machine admission", () => {
  describe("snapshot and state admission", () => {
    it("rejects unregistered event identities without inspecting the token", () => {
      let reads = 0;
      const target = new Proxy(Nested.E.tick, {
        get: () => {
          reads += 1;
          throw new Error("token lookup must not read properties");
        },
        getPrototypeOf: () => {
          reads += 1;
          throw new Error("token lookup must not read prototypes");
        },
        ownKeys: () => {
          reads += 1;
          throw new Error("token lookup must not enumerate properties");
        },
        getOwnPropertyDescriptor: () => {
          reads += 1;
          throw new Error("token lookup must not read descriptors");
        },
      });
      const revoked = Proxy.revocable(Nested.E.tick, {});
      revoked.revoke();
      for (const candidate of [target, revoked.proxy]) {
        assertUnknownFailure(
          timerWith({ delay: 1, target: candidate }),
          "UnknownEventToken",
          ["timers", "refresh", "target"],
          { issue: "definition-identity" },
        );
      }
      assert.strictEqual(reads, 0);
    });

    it("projects trusted snapshots in order without invoking accessors", () => {
      const inaccessible = Symbol("inaccessible");
      let invoked = false;
      const configuration = {};
      defineOwn(configuration, "first", { value: 1 });
      Object.defineProperty(configuration, "accessor", {
        configurable: true,
        enumerable: true,
        get: () => {
          invoked = true;
          throw new Error("configuration getter must not run");
        },
      });
      defineOwn(configuration, "last", { value: 3 });

      const snapshot = resultSuccess(
        snapshotRecord(configuration, ["configuration"], "ExpectedTimer"),
      );
      Object.defineProperty(configuration, "first", {
        configurable: true,
        enumerable: true,
        value: 2,
      });
      const captured = resultSuccess(
        captureConfigurationData(snapshot, ["configuration"], inaccessible),
      );
      if (!Predicate.isObject(captured)) throw new Error("expected captured configuration object");
      assert.deepStrictEqual(Object.keys(captured), ["first", "accessor", "last"]);
      assert.strictEqual(Object.getOwnPropertyDescriptor(captured, "first")?.value, 1);
      assert.strictEqual(
        Object.getOwnPropertyDescriptor(captured, "accessor")?.value,
        inaccessible,
      );
      assert.strictEqual(Object.getOwnPropertyDescriptor(captured, "last")?.value, 3);
      assert.strictEqual(Object.getOwnPropertyDescriptor(configuration, "first")?.value, 2);
      assert.strictEqual(invoked, false);

      for (const [key, enumerable, reason] of [
        [Symbol("symbol"), true, "NonStringConfigurationKey"],
        ["hidden", false, "UnexpectedConfigurationField"],
      ] as const) {
        const invalid = {};
        Object.defineProperty(invalid, key, {
          configurable: true,
          enumerable,
          value: true,
        });
        const invalidSnapshot = resultSuccess(
          snapshotRecord(invalid, ["configuration"], "ExpectedTimer"),
        );
        assertExactMachineFailure(
          captureConfigurationData(invalidSnapshot, ["configuration"], inaccessible),
          reason,
          ["configuration", String(key)],
          { key: String(key) },
        );
      }
    });

    it("preserves behavior-map entry order through snapshot projection", () => {
      const on = {};
      defineOwn(on, "changed", { value: Nested.S.active.S.editing });
      defineOwn(on, "tick", { value: Nested.S.idle });
      const configuration = validNestedConfiguration();
      defineOwn(configuration, "on", { value: on });

      const admitted = resultSuccess(unknownMachine(NestedResult, () => configuration));
      const handlers = admitted.compiled.states[""]?.handlers;
      if (handlers === undefined) throw new Error("expected event handlers");
      assert.deepStrictEqual(Object.keys(handlers), ["changed", "tick"]);
      assert.strictEqual(handlers.changed?.[0]?.target, Nested.S.active.S.editing);
      assert.strictEqual(handlers.tick?.[0]?.target, Nested.S.idle);
    });

    it("keeps published snapshot and array containers immutable without freezing values", () => {
      const opaque = { nested: true };
      const configuration = {};
      defineOwn(configuration, "value", { value: opaque });

      const snapshot = resultSuccess(
        snapshotRecord(configuration, ["configuration"], "ExpectedTimer"),
      );
      const entry = snapshot.properties[0];
      if (entry === undefined) throw new Error("expected snapshot property");
      const property = entry[1];
      if (property.kind !== "data") throw new Error("expected data property");

      assert.isTrue(Object.isFrozen(snapshot));
      assert.isTrue(Object.isFrozen(snapshot.properties));
      assert.isTrue(Object.isFrozen(entry));
      assert.isTrue(Object.isFrozen(property));
      assert.strictEqual(property.value, opaque);
      assert.isFalse(Object.isFrozen(opaque));
      assert.strictEqual(Reflect.set(snapshot, "properties", []), false);
      assert.strictEqual(Reflect.set(snapshot.properties, 0, []), false);
      assert.strictEqual(Reflect.set(entry, 0, "changed"), false);
      assert.strictEqual(Reflect.set(property, "value", "changed"), false);
      assert.strictEqual(property.value, opaque);

      const input = [Nested.S.idle];
      const values = resultSuccess(readArrayValues(input, ["transition"], "ExpectedTransition"));
      if (values === undefined) throw new Error("expected array values");
      assert.isTrue(Object.isFrozen(values));
      assert.isFalse(Object.isFrozen(input));
      assert.strictEqual(Reflect.set(values, 0, Nested.S.active), false);
      assert.strictEqual(values[0], Nested.S.idle);
    });

    it("admits enumerable state records with a null prototype", () => {
      const configuration = Object.create(null);
      defineOwn(configuration, "default", { value: Nested.S.idle });
      defineOwn(configuration, "states", { value: validNestedConfiguration().states });
      resultSuccess(unknownMachine(NestedResult, () => configuration));
    });

    it("derives compiled state identities directly from Definition.S", () => {
      const admitted = resultSuccess(machine(NestedResult, () => validNestedConfiguration()));
      const editing = admitted.compiled.states["S.active.S.editing"];
      const open = admitted.compiled.states["S.active.S.dialog.S.open"];
      if (editing?.kind !== "leaf" || open?.kind !== "leaf")
        throw new Error("expected compiled leaf states");
      assert.strictEqual(admitted.definition.S, Nested.S);
      assert.strictEqual(editing.state, Nested.S.active.S.editing);
      assert.strictEqual(open.state, Nested.S.active.S.dialog.S.open);
      assert.strictEqual(editing.state, admitted.definition.S.active.S.editing);
      assert.strictEqual(open.state, admitted.definition.S.active.S.dialog.S.open);
    });

    it("admits only plain root state records and maps reflection failures", () => {
      for (const value of [1, [], new Date(), new Map(), Object.create({})])
        assertUnknownFailure(value, "ConfigurationNotRecord", [], {});
      for (const trap of reflectionTraps)
        assertUnknownFailure(
          new Proxy(validNestedConfiguration(), trap),
          "ConfigurationNotRecord",
          [],
          {},
        );
    });

    it("rejects non-record nested states and compound state maps", () => {
      for (const value of [null, [], new Date(), Object.create({})])
        assertUnknownFailure(
          withNestedActive(value),
          "ExpectedStateConfiguration",
          ["states", "active"],
          {},
        );
      for (const value of [null, [], new Date(), Object.create({})]) {
        const configuration = validNestedConfiguration();
        defineOwn(configuration, "states", { value });
        assertUnknownFailure(configuration, "InvalidCompoundState", ["states"], {});
      }
    });

    it("rejects inherited compound fields and never invokes accessors", () => {
      for (const field of ["default", "states"] as const) {
        let invoked = false;
        const configuration = validNestedConfiguration();
        defineOwn(configuration, field, {
          get: () => {
            invoked = true;
            throw new Error(`${field} getter`);
          },
        });
        assertUnknownFailure(configuration, "MissingCompoundStateFields", [field], {});
        assert.strictEqual(invoked, false);
      }
    });

    it("reports missing compound fields at their exact paths", () => {
      assertUnknownFailure(
        { states: validNestedConfiguration().states },
        "MissingCompoundStateFields",
        ["default"],
        {},
      );
      assertUnknownFailure(
        { default: Nested.S.idle },
        "MissingCompoundStateFields",
        ["states"],
        {},
      );
    });

    it("reports exact state-structure diagnostics", () => {
      const extraChild = validNestedConfiguration();
      defineOwn(extraChild.states, "surplus", { value: {} });
      assertUnknownFailure(extraChild, "StateConfigurationMismatch", ["states", "surplus"], {
        key: "surplus",
      });
      const missingChild = validNestedConfiguration();
      Reflect.deleteProperty(missingChild.states, "idle");
      assertUnknownFailure(missingChild, "StateConfigurationMismatch", ["states", "idle"], {
        key: "idle",
      });
      for (const [field, path] of [
        ["default", ["states", "active", "states", "editing", "default"]],
        ["states", ["states", "active", "states", "editing", "states"]],
      ] as const) {
        const leaf = validNestedConfiguration();
        defineOwn(leaf.states.active.states.editing, field, { value: {} });
        assertUnknownFailure(leaf, "ExpectedLeafConfiguration", path, { field });
      }
      const both = validNestedConfiguration();
      defineOwn(both.states.active.states.editing, "default", { value: {} });
      defineOwn(both.states.active.states.editing, "states", { value: {} });
      assertUnknownFailure(
        both,
        "ExpectedLeafConfiguration",
        ["states", "active", "states", "editing", "default"],
        { field: "default" },
      );
      const descendantDefault = validNestedConfiguration();
      defineOwn(descendantDefault, "default", { value: Nested.S.active.S.dialog.S.open });
      assertUnknownFailure(descendantDefault, "InvalidDefaultTarget", ["default"], {});
      const combinedInvalid = validNestedConfiguration();
      defineOwn(combinedInvalid, "default", { value: Nested.S.active.S.dialog.S.open });
      defineOwn(combinedInvalid, "on", { value: { unknown: Nested.S.idle } });
      assertUnknownFailure(combinedInvalid, "InvalidDefaultTarget", ["default"], {});
    });

    it("preserves state-field optionality and behavior precedence", () => {
      const missingDefault = validNestedConfiguration();
      defineOwn(missingDefault, "default", { value: undefined });
      assertUnknownFailure(missingDefault, "MissingCompoundStateFields", ["default"], {});

      const leafUndefined = validNestedConfiguration();
      defineOwn(leafUndefined.states.active.states.editing, "default", { value: undefined });
      assertUnknownFailure(
        leafUndefined,
        "ExpectedLeafConfiguration",
        ["states", "active", "states", "editing", "default"],
        { field: "default" },
      );

      const explicitUndefined = validNestedConfiguration();
      for (const field of ["on", "redirect", "activities", "timers"] as const)
        defineOwn(explicitUndefined, field, { value: undefined });
      const admitted = resultSuccess(machine(NestedResult, () => explicitUndefined));
      assert.deepStrictEqual(admitted.compiled.states[""]?.activities, {});
      assert.deepStrictEqual(admitted.compiled.states[""]?.redirects, []);
      assert.deepStrictEqual(admitted.compiled.states[""]?.timers, {});

      const onBeforeRedirect = validNestedConfiguration();
      defineOwn(onBeforeRedirect, "on", { value: null });
      defineOwn(onBeforeRedirect, "redirect", { value: null });
      assertUnknownFailure(onBeforeRedirect, "ExpectedEventHandlers", ["on"], {});

      const redirectBeforeActivities = validNestedConfiguration();
      defineOwn(redirectBeforeActivities, "redirect", { value: null });
      defineOwn(redirectBeforeActivities, "activities", { value: null });
      assertUnknownFailure(redirectBeforeActivities, "ExpectedRedirect", ["redirect"], {});

      const activitiesBeforeTimers = validNestedConfiguration();
      defineOwn(activitiesBeforeTimers, "activities", { value: null });
      defineOwn(activitiesBeforeTimers, "timers", { value: null });
      assertUnknownFailure(activitiesBeforeTimers, "ExpectedActivities", ["activities"], {});
    });

    it("admits the whole state structure before resolving behavior", () => {
      const configuration = validNestedConfiguration();
      defineOwn(configuration, "on", { value: null });
      defineOwn(configuration.states.active.states.editing, "default", {
        value: Nested.S.idle,
      });

      assertUnknownFailure(
        configuration,
        "ExpectedLeafConfiguration",
        ["states", "active", "states", "editing", "default"],
        { field: "default" },
      );
    });

    it("compiles from the captured child table", () => {
      let ownKeysReads = 0;
      const childStates = validNestedConfiguration().states;
      const captured = new Proxy(childStates, {
        ownKeys: (source) => {
          ownKeysReads += 1;
          if (ownKeysReads === 3) throw new Error("child table reread");
          return Reflect.ownKeys(source);
        },
      });
      const configuration = validNestedConfiguration();
      defineOwn(configuration, "states", { value: captured });
      resultSuccess(unknownMachine(NestedResult, () => configuration));
      assert.strictEqual(ownKeysReads, 2);
    });

    it("rejects flapping own keys and descriptor values at each boundary", () => {
      let rootKeyReads = 0;
      const rootKeys = new Proxy(validNestedConfiguration(), {
        ownKeys: (source) => (rootKeyReads++ === 0 ? Reflect.ownKeys(source) : ["default"]),
      });
      assertUnknownFailure(rootKeys, "ConfigurationNotRecord", [], {});
      let prototypeReads = 0;
      const prototype = new Proxy(validNestedConfiguration(), {
        getPrototypeOf: () => (prototypeReads++ === 0 ? Object.prototype : null),
      });
      assertUnknownFailure(prototype, "ConfigurationNotRecord", [], {});
      let nestedDescriptorReads = 0;
      const nestedDescriptor = new Proxy(validNestedConfiguration().states.active, {
        getOwnPropertyDescriptor: (source, key) => {
          const descriptor = Object.getOwnPropertyDescriptor(source, key);
          return key === "default" &&
            nestedDescriptorReads++ === 0 &&
            descriptor !== undefined &&
            "value" in descriptor
            ? { ...descriptor, value: OtherEditor.S.ready }
            : descriptor;
        },
      });
      assertUnknownFailure(
        withNestedActive(nestedDescriptor),
        "ExpectedStateConfiguration",
        ["states", "active"],
        {},
      );
      let childKeyReads = 0;
      const childKeys = new Proxy(validNestedConfiguration().states, {
        ownKeys: (source) => {
          const keys = Reflect.ownKeys(source);
          return childKeyReads++ === 0 ? keys : keys.slice(0, 1);
        },
      });
      const childConfiguration = validNestedConfiguration();
      defineOwn(childConfiguration, "states", { value: childKeys });
      assertUnknownFailure(childConfiguration, "InvalidCompoundState", ["states"], {});
    });

    it("rejects flapping writable flags and accessor identities", () => {
      let writableReads = 0;
      const flappingWritable = new Proxy(validTransition(), {
        getOwnPropertyDescriptor: (source, key) => {
          const descriptor = Object.getOwnPropertyDescriptor(source, key);
          return key === "target" &&
            descriptor !== undefined &&
            "value" in descriptor &&
            writableReads++ === 1
            ? { ...descriptor, writable: false }
            : descriptor;
        },
      });
      assertUnknownFailure(
        transitionWith(flappingWritable),
        "ExpectedTransition",
        ["on", "tick"],
        {},
      );

      const firstGetter = () => Nested.S.idle;
      const secondGetter = () => Nested.S.idle;
      const accessor = {};
      Object.defineProperty(accessor, "target", {
        configurable: true,
        enumerable: true,
        get: firstGetter,
      });
      let accessorReads = 0;
      const flappingAccessor = new Proxy(accessor, {
        getOwnPropertyDescriptor: (source, key) => {
          const descriptor = Object.getOwnPropertyDescriptor(source, key);
          return key === "target" &&
            descriptor !== undefined &&
            !("value" in descriptor) &&
            accessorReads++ === 1
            ? { ...descriptor, get: secondGetter }
            : descriptor;
        },
      });
      assertUnknownFailure(
        transitionWith(flappingAccessor),
        "ExpectedTransition",
        ["on", "tick"],
        {},
      );
    });

    it("rejects a foreign state token at the machine boundary", () => {
      const foreignDefault = validNestedConfiguration();
      defineOwn(foreignDefault, "default", { value: OtherEditor.S.ready });
      assertUnknownFailure(foreignDefault, "UnknownStateToken", ["default"], {
        issue: "foreign-definition",
      });
    });

    it("uses exact Definition.S identity for every state reference lane", () => {
      const lookalike = { ...Nested.S.active.S.editing };
      const cases = [
        [
          (() => {
            const configuration = validNestedConfiguration();
            defineOwn(configuration, "default", { value: lookalike });
            return configuration;
          })(),
          ["default"],
        ],
        [transitionWith({ target: lookalike }), ["on", "tick", "target"]],
        [transitionWith({ target: Nested.S.idle, reenter: lookalike }), ["on", "tick", "reenter"]],
        [redirectWith({ when: () => true, target: lookalike }), ["redirect", "target"]],
      ] as const;

      for (const [configuration, path] of cases)
        assertUnknownFailure(configuration, "UnknownStateToken", path, {
          issue: "foreign-definition",
        });
    });

    it("classifies state-token accessors without invoking forbidden getters", () => {
      let invoked = false;
      const accessorToken = { ...Nested.S.idle };
      Object.defineProperty(accessorToken, "id", {
        configurable: true,
        enumerable: true,
        get: () => {
          invoked = true;
          throw new Error("state-token getter must not run");
        },
      });

      assertUnknownFailure(
        transitionWith({ target: accessorToken }),
        "InvalidStateToken",
        ["on", "tick", "target"],
        { issue: "definition-identity" },
      );
      assert.strictEqual(invoked, false);
    });

    it("does not invoke a state-token kind getter before canonical validation", () => {
      let invoked = false;
      const accessorToken = { ...Nested.S.idle };
      Object.defineProperty(accessorToken, "kind", {
        configurable: true,
        enumerable: true,
        get: () => {
          invoked = true;
          throw new Error("state-token kind getter must not run");
        },
      });

      assertUnknownFailure(
        transitionWith({ target: accessorToken }),
        "InvalidStateToken",
        ["on", "tick", "target"],
        { issue: "definition-identity" },
      );
      assert.strictEqual(invoked, false);
    });

    it("distinguishes an absent kind from a failed kind inspection", () => {
      const missingKind = { id: Nested.S.idle.id };
      assertUnknownFailure(transitionWith(missingKind), "InvalidStateToken", ["on", "tick"], {
        issue: "definition-identity",
      });

      const reads: PropertyKey[] = [];
      const throwingKind = new Proxy(
        { id: Nested.S.idle.id },
        {
          getOwnPropertyDescriptor: (source, key) => {
            reads.push(key);
            if (key === "kind") throw new Error("state-token kind inspection failed");
            return Object.getOwnPropertyDescriptor(source, key);
          },
        },
      );
      assertUnknownFailure(
        transitionWith(throwingKind),
        "UnexpectedConfigurationField",
        ["on", "tick", "id"],
        { key: "id" },
      );
      assert.deepStrictEqual(reads, ["kind", "id", "id", "id"]);

      const revoked = Proxy.revocable({ kind: "state", id: Nested.S.idle.id }, {});
      revoked.revoke();
      assertUnknownFailure(transitionWith(revoked.proxy), "ExpectedTransition", ["on", "tick"], {});
    });

    it("reads foreign token fields in order even when id inspection fails", () => {
      const reads: PropertyKey[] = [];
      let idReads = 0;
      const foreign = new Proxy(
        { kind: "state", id: OtherEditor.S.ready.id, name: "ready" },
        {
          getOwnPropertyDescriptor: (source, key) => {
            reads.push(key);
            if (key === "id" && idReads++ === 1) throw new Error("id inspection failure");
            return Object.getOwnPropertyDescriptor(source, key);
          },
        },
      );

      assertUnknownFailure(transitionWith(foreign), "InvalidStateToken", ["on", "tick"], {
        issue: "definition-identity",
      });
      assert.deepStrictEqual(reads, ["kind", "id", "kind", "id", "name"]);
    });
  });

  describe("timer and transition admission", () => {
    it("resolves the timer target once after earlier fields pass", () => {
      const target = Nested.E.tick;
      const guard = () => true;
      let resolutions = 0;
      const resolveTarget = (value: unknown, path: Diagnostic.Path) => {
        resolutions += 1;
        assert.strictEqual(value, "tick");
        assert.deepStrictEqual(path, ["timers", "refresh", "target"]);
        return Result.succeed(target);
      };
      const path = ["timers", "refresh"];

      const admitted = resultSuccess(
        admitTimer<typeof Nested>({ delay: 1, target: "tick", guard }, path, resolveTarget),
      );
      assert.strictEqual(admitted.target, target);
      assert.strictEqual(admitted.guard, guard);
      assert.strictEqual(resolutions, 1);

      resolutions = 0;
      assert.isTrue(
        Result.isFailure(
          admitTimer<typeof Nested>({ delay: -1, target: "tick" }, path, resolveTarget),
        ),
      );
      assert.isTrue(
        Result.isFailure(
          admitTimer<typeof Nested>({ delay: 1, target: "tick", extra: true }, path, resolveTarget),
        ),
      );
      assert.strictEqual(resolutions, 0);

      assert.isTrue(
        Result.isFailure(
          admitTimer<typeof Nested>({ delay: 1, target: "tick", guard: 1 }, path, resolveTarget),
        ),
      );
      assert.strictEqual(resolutions, 1);
    });

    it("validates timer admission diagnostics", () => {
      for (const delay of [Number.NaN, Number.POSITIVE_INFINITY, -1, "invalid"])
        assertUnknownFailure(
          timerWith({ delay, target: Nested.E.tick }),
          "InvalidTimerDelay",
          ["timers", "refresh", "delay"],
          { constraint: "finite-non-negative" },
        );

      assertUnknownFailure(
        timerWith({ target: Nested.E.tick }),
        "InvalidTimerDelay",
        ["timers", "refresh", "delay"],
        { constraint: "finite-non-negative" },
      );
      assertUnknownFailure(
        timerWith({ delay: 1 }),
        "UnknownEventToken",
        ["timers", "refresh", "target"],
        { issue: "definition-identity" },
      );
      assertUnknownFailure(
        timerWith({ delay: 1, target: undefined }),
        "UnknownEventToken",
        ["timers", "refresh", "target"],
        { issue: "definition-identity" },
      );
      assertUnknownFailure(
        timerWith({ delay: 1, target: undefined, guard: 1 }),
        "UnknownEventToken",
        ["timers", "refresh", "target"],
        { issue: "definition-identity" },
      );
      assertUnknownFailure(
        timerWith({ target: OtherEditor.E.opened }),
        "InvalidTimerDelay",
        ["timers", "refresh", "delay"],
        { constraint: "finite-non-negative" },
      );
      assertUnknownFailure(
        timerWith({ delay: -1, target: Nested.E.tick, guard: 1 }),
        "InvalidTimerDelay",
        ["timers", "refresh", "delay"],
        { constraint: "finite-non-negative" },
      );
      for (const entry of [null, [], "invalid"]) assertTimerFailure(entry, "ExpectedTimer");
      let timerAccessorInvoked = false;
      const timerAccessor = {};
      defineOwn(timerAccessor, "refresh", {
        get: () => {
          timerAccessorInvoked = true;
          throw new Error("timer getter must not run");
        },
      });
      const timerAccessorConfiguration = validNestedConfiguration();
      defineOwn(timerAccessorConfiguration, "timers", { value: timerAccessor });
      assertUnknownFailure(timerAccessorConfiguration, "ExpectedTimer", ["timers", "refresh"], {});
      assert.strictEqual(timerAccessorInvoked, false);
      assertUnknownFailure(
        timerWith({ delay: 1, target: OtherEditor.E.opened }),
        "UnknownEventToken",
        ["timers", "refresh", "target"],
        { issue: "definition-identity" },
      );
      const lookalike = Object.assign({}, Nested.E.tick);
      assertUnknownFailure(
        timerWith({ delay: 1, target: lookalike }),
        "UnknownEventToken",
        ["timers", "refresh", "target"],
        { issue: "definition-identity" },
      );
      for (const field of ["guard", "updateMemory"] as const) {
        const invalidTimer = { delay: 1, target: Nested.E.tick, [field]: 1 };
        assertUnknownFailure(
          timerWith(invalidTimer),
          "ExpectedFunction",
          ["timers", "refresh", field],
          {
            field,
          },
        );
      }

      for (const [field, reason, details] of [
        ["delay", "InvalidTimerDelay", { constraint: "finite-non-negative" }],
        ["target", "UnknownEventToken", { issue: "definition-identity" }],
        ["guard", "ExpectedFunction", { field: "guard" }],
      ] as const) {
        let invoked = false;
        const timer = validTimer();
        Object.defineProperty(timer, field, {
          configurable: true,
          enumerable: true,
          get: () => {
            invoked = true;
            throw new Error(`timer ${field} getter must not run`);
          },
        });
        assertUnknownFailure(timerWith(timer), reason, ["timers", "refresh", field], details);
        assert.strictEqual(invoked, false);
      }
    });

    it("copies admitted timer fields and preserves optional callback publication", () => {
      let callbackCalls = 0;
      const guard = () => {
        callbackCalls += 1;
        return true;
      };
      const updateMemory = () => {
        callbackCalls += 1;
        return { count: 1 };
      };
      const authored = { delay: 1, target: Nested.E.tick, guard, updateMemory };
      const admitted = resultSuccess(machine(NestedResult, () => timerWith(authored)));
      const timer = admitted.compiled.states[""]?.timers.refresh;
      if (timer === undefined) throw new Error("expected compiled timer");
      assert.strictEqual(timer.delay, 1);
      assert.strictEqual(timer.target, Nested.E.tick);
      assert.strictEqual(timer.guard, guard);
      assert.strictEqual(timer.updateMemory, updateMemory);
      assert.strictEqual(callbackCalls, 0);

      authored.delay = 2;
      Object.defineProperty(authored, "target", { value: OtherEditor.E.opened });
      authored.guard = () => false;
      assert.strictEqual(timer.delay, 1);
      assert.strictEqual(timer.target, Nested.E.tick);
      assert.strictEqual(timer.guard, guard);

      const omitted = resultSuccess(
        machine(NestedResult, () => timerWith({ delay: 1, target: Nested.E.tick })),
      ).compiled.states[""]?.timers.refresh;
      const explicitUndefined = resultSuccess(
        machine(NestedResult, () =>
          timerWith({ delay: 1, target: Nested.E.tick, guard: undefined, updateMemory: undefined }),
        ),
      ).compiled.states[""]?.timers.refresh;
      if (omitted === undefined || explicitUndefined === undefined)
        throw new Error("expected compiled timer variants");
      assert.strictEqual(Object.hasOwn(omitted, "guard"), false);
      assert.strictEqual(Object.hasOwn(omitted, "updateMemory"), false);
      assert.strictEqual(Object.hasOwn(explicitUndefined, "guard"), false);
      assert.strictEqual(Object.hasOwn(explicitUndefined, "updateMemory"), false);
    });

    it("admits transition and timer objects through stable plain snapshots", () => {
      for (const [make, wrap, reason, path, changedKey, changedValue] of [
        [
          validTransition,
          transitionWith,
          "ExpectedTransition",
          ["on", "tick"],
          "target",
          OtherEditor.S.ready,
        ],
        [validTimer, timerWith, "ExpectedTimer", ["timers", "refresh"], "delay", 2],
      ] as const) {
        for (const value of [new Date(), new Map(), Object.create({})])
          assertUnknownFailure(wrap(value), reason, path, {});
        for (const trap of reflectionTraps)
          assertUnknownFailure(wrap(new Proxy(make(), trap)), reason, path, {});

        let prototypeReads = 0;
        const flappingPrototype = new Proxy(make(), {
          getPrototypeOf: () => (prototypeReads++ === 0 ? Object.prototype : null),
        });
        assertUnknownFailure(wrap(flappingPrototype), reason, path, {});
        let keyReads = 0;
        const flappingKeys = new Proxy(make(), {
          ownKeys: (source) => (keyReads++ === 0 ? Reflect.ownKeys(source) : []),
        });
        assertUnknownFailure(wrap(flappingKeys), reason, path, {});
        let descriptorReads = 0;
        const flappingDescriptor = new Proxy(make(), {
          getOwnPropertyDescriptor: (source, key) => {
            const descriptor = Object.getOwnPropertyDescriptor(source, key);
            return key === changedKey &&
              descriptor !== undefined &&
              "value" in descriptor &&
              descriptorReads++ === 0
              ? { ...descriptor, value: changedValue }
              : descriptor;
          },
        });
        assertUnknownFailure(wrap(flappingDescriptor), reason, path, {});
      }
    });

    it("preserves transition and timer diagnostic precedence without invoking accessors", () => {
      assertTransitionFailure({}, "TransitionObjectRequired");

      for (const field of ["target", "reenter"] as const) {
        let invoked = false;
        const accessor = validTransition();
        Object.defineProperty(accessor, field, {
          configurable: true,
          enumerable: true,
          get: () => {
            invoked = true;
            throw new Error(`transition ${field} getter must not run`);
          },
        });
        assertUnknownFailure(transitionWith(accessor), "InvalidStateToken", ["on", "tick", field], {
          issue: "definition-identity",
        });
        assert.strictEqual(invoked, false);
      }

      for (const enumerable of [true, false]) {
        const stateKind = validTransition();
        Object.defineProperty(stateKind, "kind", {
          configurable: true,
          enumerable,
          value: "state",
        });
        assertUnknownFailure(transitionWith(stateKind), "InvalidStateToken", ["on", "tick"], {
          issue: "definition-identity",
        });
      }

      for (const [make, wrap, path] of [
        [validTransition, transitionWith, ["on", "tick"]],
        [validTimer, timerWith, ["timers", "refresh"]],
      ] as const) {
        const value = make();
        const symbol = Symbol("unexpected");
        Object.defineProperty(value, symbol, { enumerable: true, value: true });
        assertUnknownFailure(wrap(value), "NonStringConfigurationKey", [...path, String(symbol)], {
          key: String(symbol),
        });

        const hidden = make();
        Object.defineProperty(hidden, "hidden", { value: true });
        assertUnknownFailure(wrap(hidden), "UnexpectedConfigurationField", [...path, "hidden"], {
          key: "hidden",
        });
      }
    });

    it("admits complete transitions once in ordered schema phases", () => {
      const guard = () => true;
      const updateMemory = () => ({ count: 1 });
      const actions = () => null;
      const resolutions: string[] = [];
      const resolvedTarget = { id: "target" };
      const resolvedReenter = { id: "reenter" };
      const resolveTarget = (value: unknown, targetPath: Diagnostic.Path) => {
        resolutions.push(String(targetPath.at(-1)));
        return Result.succeed(value === "target" ? resolvedTarget : resolvedReenter);
      };
      const admitted = resultSuccess(
        admitTransition(
          { target: "target", guard, updateMemory, actions, reenter: "reenter" },
          ["on", "tick"],
          resolveTarget,
        ),
      );
      assert.strictEqual(admitted.target, resolvedTarget);
      assert.strictEqual(admitted.reenter, resolvedReenter);
      assert.strictEqual(admitted.guard, guard);
      assert.strictEqual(admitted.updateMemory, updateMemory);
      assert.strictEqual(admitted.actions, actions);
      assert.deepStrictEqual(resolutions, ["target", "reenter"]);

      const compiled = resultSuccess(
        machine(NestedResult, () =>
          transitionWith({ target: Nested.S.idle, guard, updateMemory, actions }),
        ),
      ).compiled.states[""]?.handlers.tick?.[0];
      if (compiled === undefined) throw new Error("expected compiled transition");
      assert.strictEqual(compiled.target, Nested.S.idle);
      assert.strictEqual(compiled.guard, guard);
      assert.strictEqual(compiled.updateMemory, updateMemory);
      assert.strictEqual(compiled.actions, actions);
      assert.strictEqual(Object.hasOwn(compiled, "reenter"), false);

      const explicitUndefined = resultSuccess(
        machine(NestedResult, () =>
          transitionWith({
            target: Nested.S.idle,
            guard: undefined,
            updateMemory: undefined,
            actions: undefined,
            reenter: undefined,
          }),
        ),
      ).compiled.states[""]?.handlers.tick?.[0];
      if (explicitUndefined === undefined) throw new Error("expected undefined transition variant");
      for (const field of ["guard", "updateMemory", "actions", "reenter"])
        assert.strictEqual(Object.hasOwn(explicitUndefined, field), false);
    });

    it("preserves the original target diagnostic through the Schema bridge", () => {
      const originalResult = invalidConfiguration("UnknownStateToken", ["original", "target"], {
        issue: "foreign-definition",
      });
      if (Result.isSuccess(originalResult)) throw new Error("expected the original diagnostic");

      const result = admitTransition({ target: "foreign", guard: 1 }, ["on", "tick"], () =>
        Result.fail(originalResult.failure),
      );
      if (Result.isSuccess(result)) throw new Error("expected the target diagnostic");
      assert.strictEqual(result.failure, originalResult.failure);
      assert.deepStrictEqual(result.failure.path, ["original", "target"]);

      const redirectResult = admitRedirectConfiguration<typeof Nested>(
        { when: () => true, target: "foreign" },
        ["redirect"],
        () => Result.fail(originalResult.failure),
      );
      if (Result.isSuccess(redirectResult))
        throw new Error("expected the redirect target diagnostic");
      assert.strictEqual(redirectResult.failure, originalResult.failure);
      assert.deepStrictEqual(redirectResult.failure.path, ["original", "target"]);

      const handlerResult = admitEventHandlers(
        { on: { tick: OtherEditor.S.ready } },
        [],
        Nested.E,
        new Set(),
        () => Result.fail(originalResult.failure),
      );
      if (Result.isSuccess(handlerResult))
        throw new Error("expected the handler target diagnostic");
      assert.strictEqual(handlerResult.failure, originalResult.failure);
      assert.deepStrictEqual(handlerResult.failure.path, ["original", "target"]);
    });

    it("preserves the original timer target diagnostic through the Schema bridge", () => {
      const originalResult = invalidConfiguration("UnknownEventToken", ["original", "target"], {
        issue: "foreign-definition",
      });
      if (Result.isSuccess(originalResult)) throw new Error("expected the original diagnostic");

      const result = admitTimer(
        { delay: 1, target: "foreign", guard: 1 },
        ["timers", "refresh"],
        () => Result.fail(originalResult.failure),
      );
      if (Result.isSuccess(result)) throw new Error("expected the timer target diagnostic");
      assert.strictEqual(result.failure, originalResult.failure);
      assert.deepStrictEqual(result.failure.path, ["original", "target"]);
    });

    it("preserves transition phase precedence and callback safety", () => {
      assertTransitionFailure({ guard: 1, updateMemory: 1 }, "TransitionObjectRequired");
      assertUnknownFailure(
        transitionWith({ target: OtherEditor.S.ready, guard: 1 }),
        "UnknownStateToken",
        ["on", "tick", "target"],
        { issue: "foreign-definition" },
      );
      for (const [first, second] of [
        ["guard", "updateMemory"],
        ["updateMemory", "actions"],
        ["actions", "reenter"],
      ] as const) {
        const value = { target: Nested.S.idle, [first]: 1, [second]: OtherEditor.S.ready };
        assertUnknownFailure(transitionWith(value), "ExpectedFunction", ["on", "tick", first], {
          field: first,
        });
      }
      const extra = { target: OtherEditor.S.ready, extra: true };
      assertUnknownFailure(
        transitionWith(extra),
        "UnexpectedConfigurationField",
        ["on", "tick", "extra"],
        {
          key: "extra",
        },
      );
      const invalidReenter = { target: Nested.S.idle, reenter: OtherEditor.S.ready };
      assertUnknownFailure(
        transitionWith(invalidReenter),
        "UnknownStateToken",
        ["on", "tick", "reenter"],
        { issue: "foreign-definition" },
      );

      let invoked = false;
      const callbackAccessor = validTransition();
      Object.defineProperty(callbackAccessor, "guard", {
        configurable: true,
        enumerable: true,
        get: () => {
          invoked = true;
          throw new Error("transition callback getter must not run");
        },
      });
      assertUnknownFailure(
        transitionWith(callbackAccessor),
        "ExpectedFunction",
        ["on", "tick", "guard"],
        { field: "guard" },
      );
      assert.strictEqual(invoked, false);
    });

    it("returns a typed failure for ancestor and descendant handler ambiguity", () => {
      const result = machine(NestedResult, () => ({
        ...validNestedConfiguration(),
        on: { tick: Nested.S.idle },
        states: {
          ...validNestedConfiguration().states,
          idle: { on: { tick: Nested.S.idle } },
          active: {
            ...validNestedConfiguration().states.active,
            states: {
              editing: {},
              dialog: {
                default: Nested.S.active.S.dialog.S.open,
                states: { open: {}, closed: {} },
              },
            },
          },
        },
      }));
      assertExactMachineFailure(result, "AmbiguousHandler", ["states", "idle"], { event: "tick" });
    });

    it("rejects transition kind and timer action fields", () => {
      const extraTransition = validNestedConfiguration();
      Object.assign(extraTransition.states.active.states.editing, {
        on: {
          changed: Object.assign({ target: Nested.S.active.S.editing }, { kind: "transition" }),
        },
      });
      assertUnknownFailure(
        extraTransition,
        "UnexpectedConfigurationField",
        ["states", "active", "states", "editing", "on", "changed", "kind"],
        { key: "kind" },
      );
      const stateTransition = validNestedConfiguration();
      Object.assign(stateTransition.states.active.states.editing, {
        on: { changed: { target: Nested.S.active.S.editing, kind: "state" } },
      });
      assertUnknownFailure(
        stateTransition,
        "InvalidStateToken",
        ["states", "active", "states", "editing", "on", "changed"],
        { issue: "definition-identity" },
      );
      const extraTimer = validNestedConfiguration();
      Object.assign(extraTimer.states.active, {
        timers: {
          refresh: Object.assign({ delay: 100, target: Nested.E.tick }, { actions: [] }),
        },
      });
      assertUnknownFailure(
        extraTimer,
        "UnexpectedConfigurationField",
        ["states", "active", "timers", "refresh", "actions"],
        { key: "actions" },
      );
    });

    it("rejects malformed behavior containers with canonical diagnostics", () => {
      const cases = [
        { field: "on", reason: "ExpectedEventHandlers" },
        { field: "activities", reason: "ExpectedActivities" },
        { field: "timers", reason: "ExpectedTimer" },
      ] as const;
      for (const { field, reason } of cases) {
        for (const value of [null, [], 1]) {
          const configuration = validNestedConfiguration();
          defineOwn(configuration, field, { value });
          assertUnknownFailure(configuration, reason, [field], {});
        }
        const configuration = validNestedConfiguration();
        defineOwn(configuration, field, {
          get: () => {
            throw new Error("container getter must not run");
          },
        });
        assertUnknownFailure(configuration, reason, [field], {});

        for (const value of [new Date(), new Map(), Object.create({})]) {
          const invalidRecord = validNestedConfiguration();
          defineOwn(invalidRecord, field, { value });
          assertUnknownFailure(invalidRecord, reason, [field], {});
        }

        for (const trap of reflectionTraps) {
          const reflected = validNestedConfiguration();
          defineOwn(reflected, field, { value: new Proxy(behaviorMapTarget(field), trap) });
          assertUnknownFailure(reflected, reason, [field], {});
        }

        let keyReads = 0;
        const flappingKeys = new Proxy(behaviorMapTarget(field), {
          ownKeys: (source) => {
            keyReads += 1;
            return keyReads === 1 ? Reflect.ownKeys(source) : [];
          },
        });
        const keyConfiguration = validNestedConfiguration();
        defineOwn(keyConfiguration, field, { value: flappingKeys });
        assertUnknownFailure(keyConfiguration, reason, [field], {});

        let descriptorReads = 0;
        const descriptorTarget = behaviorMapTarget(field);
        const descriptorKey = Reflect.ownKeys(descriptorTarget)[0];
        const flappingDescriptor = new Proxy(descriptorTarget, {
          getOwnPropertyDescriptor: (source, key) => {
            const descriptor = Object.getOwnPropertyDescriptor(source, key);
            if (
              key === descriptorKey &&
              descriptorReads++ === 0 &&
              descriptor !== undefined &&
              "value" in descriptor
            )
              return { ...descriptor, value: {} };
            return descriptor;
          },
        });
        const descriptorConfiguration = validNestedConfiguration();
        defineOwn(descriptorConfiguration, field, { value: flappingDescriptor });
        assertUnknownFailure(descriptorConfiguration, reason, [field], {});
      }
    });
  });

  describe("activity and event-handler admission", () => {
    it("admits only constructed continuing plans from the exact operation family", () => {
      const admitted = resultSuccess(
        machine(ActivityDefinitionResult, ({ S, O }) => ({
          default: S.idle,
          activities: {
            resource: O.resource.subscribe("resource"),
            stream: O.stream.subscribe("stream"),
          },
          states: { idle: {} },
        })),
      );
      const activities = admitted.compiled.states[""]?.activities;
      assert.strictEqual(activities?.resource?.kind, "resource-subscribe");
      assert.strictEqual(activities?.resource?.descriptor, ActivityResource.id);
      assert.strictEqual(activities?.stream?.kind, "stream-subscribe");
      assert.strictEqual(activities?.stream?.descriptor, ActivityStream.id);

      const directPlan = operationPlan(
        "resource-subscribe",
        ActivityResource.id,
        ActivityResource.key,
        "direct",
      );
      assertExactMachineFailure(
        unknownMachine(ActivityDefinitionResult, () => activityConfiguration(directPlan)),
        "ExpectedActivities",
        ["activities", "service"],
        {},
      );

      const forged = { ...ActivityResource.subscribe("forged") };
      const wrongFamily = operationPlan(
        "stream-subscribe",
        ActivityResource.id,
        ActivityResource.key,
        "wrong-family",
      );
      const wrongDescriptor = ForeignActivityResource.subscribe("wrong-descriptor");
      const accessor = {};
      let accessorInvoked = false;
      Object.defineProperty(accessor, "kind", {
        enumerable: true,
        get: () => {
          accessorInvoked = true;
          throw new Error("activity plan getter must not run");
        },
      });

      for (const value of [
        forged,
        ActivityResource.lookup("finite"),
        wrongFamily,
        wrongDescriptor,
        SameIdForeignActivityResource.subscribe("same-id-resource"),
        SameIdForeignActivityStream.subscribe("same-id-stream"),
        accessor,
        {},
      ]) {
        assertExactMachineFailure(
          unknownMachine(ActivityDefinitionResult, () => activityConfiguration(value)),
          "ExpectedActivities",
          ["activities", "service"],
          {},
        );
      }
      assert.strictEqual(accessorInvoked, false);
    });

    it("rejects activity symbols, hidden fields, and accessors in order", () => {
      const symbol = Symbol("hidden-activity");
      const symbolActivities = {};
      Object.defineProperty(symbolActivities, symbol, {
        configurable: true,
        enumerable: false,
        value: { opaque: true },
      });
      const symbolConfiguration = validNestedConfiguration();
      defineOwn(symbolConfiguration, "activities", { value: symbolActivities });
      assertUnknownFailure(
        symbolConfiguration,
        "NonStringConfigurationKey",
        ["activities", String(symbol)],
        {
          key: String(symbol),
        },
      );

      const hiddenActivities = {};
      Object.defineProperty(hiddenActivities, "hidden", {
        configurable: true,
        value: { opaque: true },
      });
      const hiddenConfiguration = validNestedConfiguration();
      defineOwn(hiddenConfiguration, "activities", { value: hiddenActivities });
      assertUnknownFailure(
        hiddenConfiguration,
        "UnexpectedConfigurationField",
        ["activities", "hidden"],
        {
          key: "hidden",
        },
      );

      let invoked = false;
      const accessorActivities = {};
      Object.defineProperty(accessorActivities, "service", {
        configurable: true,
        enumerable: true,
        get: () => {
          invoked = true;
          throw new Error("activity getter must not run");
        },
      });
      const accessorConfiguration = validNestedConfiguration();
      defineOwn(accessorConfiguration, "activities", { value: accessorActivities });
      assertUnknownFailure(
        accessorConfiguration,
        "ExpectedActivities",
        ["activities", "service"],
        {},
      );
      assert.strictEqual(invoked, false);
    });

    it("admits event handlers only for known events and valid entries", () => {
      for (const entry of [undefined, null, "invalid"])
        assertUnknownFailure(transitionWith(entry), "ExpectedTransition", ["on", "tick"], {});
      assertUnknownFailure(transitionWith([]), "EmptyEventHandlerList", ["on", "tick"], {});
      for (const [entry, path] of [
        [OtherEditor.S.ready, ["on", "tick"]],
        [[OtherEditor.S.ready], ["on", "tick", 0]],
      ] as const)
        assertUnknownFailure(transitionWith(entry), "UnknownStateToken", path, {
          issue: "foreign-definition",
        });
      const unknownOn = {};
      defineOwn(unknownOn, "unknown", { value: Nested.S.idle });
      defineOwn(unknownOn, "tick", { value: [] });
      const unknownConfiguration = validNestedConfiguration();
      defineOwn(unknownConfiguration, "on", { value: unknownOn });
      assertUnknownFailure(unknownConfiguration, "UnknownEventHandler", ["on", "unknown"], {
        event: "unknown",
      });

      Object.defineProperty(Nested.E, "injected", {
        configurable: true,
        enumerable: false,
        value: Nested.E.tick,
      });
      try {
        const hiddenEventOn = {};
        defineOwn(hiddenEventOn, "injected", { value: [] });
        const hiddenEventConfiguration = validNestedConfiguration();
        defineOwn(hiddenEventConfiguration, "on", { value: hiddenEventOn });
        assertUnknownFailure(hiddenEventConfiguration, "UnknownEventHandler", ["on", "injected"], {
          event: "injected",
        });
      } finally {
        Reflect.deleteProperty(Nested.E, "injected");
      }

      const symbol = Symbol("unexpected");
      const symbolOn = {};
      defineOwn(symbolOn, symbol, { value: Nested.S.idle });
      const symbolConfiguration = validNestedConfiguration();
      defineOwn(symbolConfiguration, "on", { value: symbolOn });
      assertUnknownFailure(
        symbolConfiguration,
        "NonStringConfigurationKey",
        ["on", String(symbol)],
        {
          key: String(symbol),
        },
      );

      let handlerInvoked = false;
      const accessorOn = {};
      Object.defineProperty(accessorOn, "tick", {
        configurable: true,
        enumerable: true,
        get: () => {
          handlerInvoked = true;
          throw new Error("handler getter must not run");
        },
      });
      const accessorConfiguration = validNestedConfiguration();
      defineOwn(accessorConfiguration, "on", { value: accessorOn });
      assertUnknownFailure(accessorConfiguration, "ExpectedTransition", ["on", "tick"], {});
      assert.strictEqual(handlerInvoked, false);
    });

    it("admits event-handler lists through stable intrinsic snapshots", () => {
      const guard = () => true;
      const transitions = resultSuccess(
        machine(NestedResult, () =>
          transitionWith([Nested.S.idle, { target: Nested.S.active.S.editing, guard }]),
        ),
      ).compiled.states[""]?.handlers.tick;
      assert.deepStrictEqual(
        transitions?.map(({ target }) => target),
        [Nested.S.idle, Nested.S.active.S.editing],
      );
      assert.strictEqual(transitions?.[1]?.guard, guard);

      for (const [entry, path] of [
        [
          [Nested.S.idle, null],
          ["on", "tick", 1],
        ],
        [
          (() => {
            const sparse: unknown[] = [];
            sparse.length = 2;
            sparse[0] = Nested.S.idle;
            return sparse;
          })(),
          ["on", "tick", 1],
        ],
      ] as const)
        assertUnknownFailure(transitionWith(entry), "ExpectedTransition", path, {});

      let laterTargetInvoked = false;
      const laterInvalidEntry = {};
      Object.defineProperty(laterInvalidEntry, "target", {
        configurable: true,
        enumerable: true,
        get: () => {
          laterTargetInvoked = true;
          throw new Error("later event-handler entry must not be admitted");
        },
      });
      assertUnknownFailure(
        transitionWith([null, laterInvalidEntry]),
        "ExpectedTransition",
        ["on", "tick", 0],
        {},
      );
      assert.strictEqual(laterTargetInvoked, false);

      let accessorInvoked = false;
      const accessor = [Nested.S.idle, Nested.S.active.S.editing];
      Object.defineProperty(accessor, 1, {
        configurable: true,
        enumerable: true,
        get: () => {
          accessorInvoked = true;
          throw new Error("event-handler accessor must not run");
        },
      });
      assertUnknownFailure(transitionWith(accessor), "ExpectedTransition", ["on", "tick", 1], {});
      assert.strictEqual(accessorInvoked, false);

      const customPrototype = [Nested.S.idle];
      Object.setPrototypeOf(customPrototype, Object.create(Array.prototype));
      assertUnknownFailure(
        transitionWith(customPrototype),
        "ExpectedTransition",
        ["on", "tick"],
        {},
      );

      for (const trap of reflectionTraps) {
        const array = new Proxy([Nested.S.idle], trap);
        assertUnknownFailure(transitionWith(array), "ExpectedTransition", ["on", "tick"], {});
      }

      const revoked = Proxy.revocable([Nested.S.idle], {});
      revoked.revoke();
      assertUnknownFailure(transitionWith(revoked.proxy), "ExpectedTransition", ["on", "tick"], {});

      let prototypeReads = 0;
      const flappingPrototype = new Proxy([Nested.S.idle], {
        getPrototypeOf: () => {
          prototypeReads += 1;
          return prototypeReads === 1 ? Array.prototype : null;
        },
      });
      assertUnknownFailure(
        transitionWith(flappingPrototype),
        "ExpectedTransition",
        ["on", "tick"],
        {},
      );

      let keyReads = 0;
      const flappingKeys = new Proxy([Nested.S.idle], {
        ownKeys: (source) => {
          keyReads += 1;
          const keys = Reflect.ownKeys(source);
          return keyReads === 1 ? keys : keys.reverse();
        },
      });
      assertUnknownFailure(transitionWith(flappingKeys), "ExpectedTransition", ["on", "tick"], {});

      let descriptorReads = 0;
      const flappingDescriptor = new Proxy([Nested.S.idle], {
        getOwnPropertyDescriptor: (source, key) => {
          const descriptor = Object.getOwnPropertyDescriptor(source, key);
          if (key === "0" && descriptor !== undefined && "value" in descriptor) {
            descriptorReads += 1;
            if (descriptorReads === 1) return { ...descriptor, value: Nested.S.active };
          }
          return descriptor;
        },
      });
      assertUnknownFailure(
        transitionWith(flappingDescriptor),
        "ExpectedTransition",
        ["on", "tick"],
        {},
      );

      for (const [key, reason] of [
        ["entries", "UnexpectedConfigurationField"],
        [Symbol.iterator, "NonStringConfigurationKey"],
      ] as const) {
        let invoked = false;
        const overridden = [Nested.S.idle];
        Object.defineProperty(overridden, key, {
          configurable: true,
          enumerable: true,
          value: () => {
            invoked = true;
            throw new Error("event-handler override must not run");
          },
        });
        assertUnknownFailure(transitionWith(overridden), reason, ["on", "tick", String(key)], {
          key: String(key),
        });
        assert.strictEqual(invoked, false);
      }

      // oxlint-disable-next-line anti-slop/no-object-freeze -- Directly proves readonly array admission.
      const frozen = Object.freeze([Nested.S.idle]);
      const frozenResult = resultSuccess(machine(NestedResult, () => transitionWith(frozen)));
      assert.strictEqual(
        frozenResult.compiled.states[""]?.handlers.tick?.[0]?.target,
        Nested.S.idle,
      );
      assertUnknownFailure(
        // oxlint-disable-next-line anti-slop/no-object-freeze -- Directly proves readonly empty-list admission.
        transitionWith(Object.freeze([])),
        "EmptyEventHandlerList",
        ["on", "tick"],
        {},
      );
    });
  });

  describe("redirect admission", () => {
    it("admits redirect records and frozen lists through owned snapshots", () => {
      let callbackCalls = 0;
      const firstWhen = () => {
        callbackCalls += 1;
        return true;
      };
      const secondWhen = () => false;
      const first = { when: firstWhen, target: Nested.S.idle };
      const second = { when: secondWhen, target: Nested.S.active.S.editing };
      const single = resultSuccess(machine(NestedResult, () => redirectWith(first)));
      const singleRedirects = single.compiled.states[""]?.redirects;
      assert.strictEqual(singleRedirects?.[0]?.when, firstWhen);
      assert.strictEqual(singleRedirects?.[0]?.target, Nested.S.idle);

      // oxlint-disable-next-line anti-slop/no-object-freeze -- Directly proves readonly redirect-list admission.
      const frozen = Object.freeze([first, second]);
      const list = resultSuccess(machine(NestedResult, () => redirectWith(frozen)));
      const redirects = list.compiled.states[""]?.redirects;
      assert.deepStrictEqual(
        redirects?.map(({ target }) => target),
        [Nested.S.idle, Nested.S.active.S.editing],
      );
      assert.deepStrictEqual(
        redirects?.map(({ when }) => when),
        [firstWhen, secondWhen],
      );
      assert.strictEqual(callbackCalls, 0);

      const nullPrototype = Object.create(null);
      defineOwn(nullPrototype, "when", { value: firstWhen });
      defineOwn(nullPrototype, "target", { value: Nested.S.idle });
      assert.strictEqual(
        resultSuccess(machine(NestedResult, () => redirectWith(nullPrototype))).compiled.states[""]
          ?.redirects[0]?.target,
        Nested.S.idle,
      );
    });

    it("stops redirect entry validation after the first failure", () => {
      const secondFailureResult = invalidConfiguration(
        "UnknownStateToken",
        ["redirect", 1, "target"],
        { issue: "foreign-definition" },
      );
      if (Result.isSuccess(secondFailureResult)) throw new Error("expected a redirect diagnostic");
      const secondFailure = secondFailureResult.failure;
      const targetValidationPaths: Diagnostic.Path[] = [];
      const result = admitRedirectConfiguration<typeof Nested>(
        [
          { when: () => true, target: Nested.S.idle },
          { when: () => true, target: Nested.S.active.S.editing },
          { when: () => true, target: Nested.S.active.S.dialog.S.open },
        ],
        ["redirect"],
        (target, path) => {
          targetValidationPaths.push(path);
          return target === Nested.S.idle
            ? Result.succeed(Nested.S.idle)
            : Result.fail(secondFailure);
        },
      );

      if (Result.isSuccess(result)) throw new Error("expected the second redirect to fail");
      assert.strictEqual(result.failure, secondFailure);
      assert.deepStrictEqual(targetValidationPaths, [
        ["redirect", 0, "target"],
        ["redirect", 1, "target"],
      ]);
    });

    it("admits every redirect record structurally before semantic validation", () => {
      const semanticFailure = invalidConfiguration("UnknownStateToken", ["semantic", "target"], {
        issue: "foreign-definition",
      });
      if (Result.isSuccess(semanticFailure)) throw new Error("expected a semantic diagnostic");

      const targetValidationPaths: Diagnostic.Path[] = [];
      const structuralResult = admitRedirectConfiguration<typeof Nested>(
        [
          { when: () => true, target: OtherEditor.S.ready },
          { when: () => true, target: Nested.S.idle, extra: true },
        ],
        ["redirect"],
        (_target, path) => {
          targetValidationPaths.push(path);
          return Result.fail(semanticFailure.failure);
        },
      );
      assertExactMachineFailure(
        structuralResult,
        "UnexpectedConfigurationField",
        ["redirect", 1, "extra"],
        { key: "extra" },
      );
      assert.deepStrictEqual(targetValidationPaths, []);

      let targetValidationCalls = 0;
      const callbackResult = admitRedirectConfiguration<typeof Nested>(
        { when: 1, target: Nested.S.idle },
        ["redirect"],
        () => {
          targetValidationCalls += 1;
          return Result.succeed(Nested.S.idle);
        },
      );
      assertExactMachineFailure(callbackResult, "ExpectedFunction", ["redirect", "when"], {
        field: "when",
      });
      assert.strictEqual(targetValidationCalls, 0);
    });

    it("maps redirect shape, reflection, and semantic failures without invoking accessors", () => {
      for (const value of [null, 1, [null], {}, { when: () => true }])
        assertUnknownFailure(
          redirectWith(value),
          "ExpectedRedirect",
          ["redirect", ...(Array.isArray(value) ? [0] : [])],
          {},
        );
      assertUnknownFailure(
        redirectWith(
          // oxlint-disable-next-line anti-slop/no-object-freeze -- Directly proves readonly empty-list admission.
          Object.freeze([]),
        ),
        "EmptyRedirectList",
        ["redirect"],
        {},
      );
      assertUnknownFailure(
        redirectWith({ when: 1, target: Nested.S.idle }),
        "ExpectedFunction",
        ["redirect", "when"],
        { field: "when" },
      );
      assertUnknownFailure(
        redirectWith({ when: undefined, target: Nested.S.idle }),
        "ExpectedFunction",
        ["redirect", "when"],
        { field: "when" },
      );
      assertUnknownFailure(
        redirectWith({ when: () => true, target: undefined }),
        "InvalidStateToken",
        ["redirect", "target"],
        { issue: "definition-identity" },
      );
      assertUnknownFailure(
        redirectWith({ when: () => true, target: OtherEditor.S.ready }),
        "UnknownStateToken",
        ["redirect", "target"],
        { issue: "foreign-definition" },
      );

      for (const value of [
        new Date(),
        new Map(),
        new (class RedirectRecord {
          readonly when = () => true;
          readonly target = Nested.S.idle;
        })(),
        Object.setPrototypeOf({ when: () => true, target: Nested.S.idle }, {}),
      ])
        assertUnknownFailure(redirectWith(value), "ExpectedRedirect", ["redirect"], {});

      for (const [field, reason, details] of [
        ["when", "ExpectedFunction", { field: "when" }],
        ["target", "InvalidStateToken", { issue: "definition-identity" }],
      ] as const) {
        let invoked = false;
        const record = { when: () => true, target: Nested.S.idle };
        Object.defineProperty(record, field, {
          configurable: true,
          enumerable: true,
          get: () => {
            invoked = true;
            throw new Error(`redirect ${field} getter must not run`);
          },
        });
        assertUnknownFailure(redirectWith(record), reason, ["redirect", field], details);
        assert.strictEqual(invoked, false);
      }

      for (const record of [{}, { when: () => true }, { target: Nested.S.idle }])
        assertUnknownFailure(redirectWith(record), "ExpectedRedirect", ["redirect"], {});

      const sparse: unknown[] = [];
      sparse.length = 2;
      sparse[0] = { when: () => true, target: Nested.S.idle };
      assertUnknownFailure(redirectWith(sparse), "ExpectedRedirect", ["redirect", 1], {});

      for (const later of [null, { when: () => true }]) {
        assertUnknownFailure(
          redirectWith([{ when: 1, target: Nested.S.idle }, later]),
          "ExpectedRedirect",
          ["redirect", 1],
          {},
        );
      }
      assertUnknownFailure(
        redirectWith([{ when: () => true, target: Nested.S.idle, extra: true }, null]),
        "UnexpectedConfigurationField",
        ["redirect", 0, "extra"],
        { key: "extra" },
      );
      assertUnknownFailure(
        redirectWith([
          { when: () => true, target: Nested.S.idle },
          { when: () => true, target: Nested.S.idle, extra: true },
        ]),
        "UnexpectedConfigurationField",
        ["redirect", 1, "extra"],
        { key: "extra" },
      );
      assertUnknownFailure(
        redirectWith([
          { when: () => true, target: Nested.S.idle },
          { when: 1, target: Nested.S.idle },
        ]),
        "ExpectedFunction",
        ["redirect", 1, "when"],
        { field: "when" },
      );
      assertUnknownFailure(
        redirectWith([
          { when: () => true, target: Nested.S.idle },
          { when: () => true, target: OtherEditor.S.ready },
        ]),
        "UnknownStateToken",
        ["redirect", 1, "target"],
        { issue: "foreign-definition" },
      );

      const symbol = Symbol("redirect");
      const symbolRecord = { when: () => true, target: Nested.S.idle };
      defineOwn(symbolRecord, symbol, { value: true });
      assertUnknownFailure(
        redirectWith(symbolRecord),
        "NonStringConfigurationKey",
        ["redirect", String(symbol)],
        { key: String(symbol) },
      );

      const hiddenRecord = { when: () => true, target: Nested.S.idle };
      Object.defineProperty(hiddenRecord, "hidden", { configurable: true, value: true });
      assertUnknownFailure(
        redirectWith(hiddenRecord),
        "UnexpectedConfigurationField",
        ["redirect", "hidden"],
        { key: "hidden" },
      );

      for (const trap of reflectionTraps)
        assertUnknownFailure(
          redirectWith(new Proxy({ when: () => true, target: Nested.S.idle }, trap)),
          "ExpectedRedirect",
          ["redirect"],
          {},
        );

      let prototypeReads = 0;
      const flappingPrototype = new Proxy(
        { when: () => true, target: Nested.S.idle },
        {
          getPrototypeOf: () => (prototypeReads++ === 0 ? Object.prototype : null),
        },
      );
      assertUnknownFailure(redirectWith(flappingPrototype), "ExpectedRedirect", ["redirect"], {});

      let keyReads = 0;
      const flappingKeys = new Proxy(
        { when: () => true, target: Nested.S.idle },
        {
          ownKeys: (source) => (keyReads++ === 0 ? Reflect.ownKeys(source) : ["when"]),
        },
      );
      assertUnknownFailure(redirectWith(flappingKeys), "ExpectedRedirect", ["redirect"], {});

      let descriptorReads = 0;
      const flappingDescriptor = new Proxy(
        { when: () => true, target: Nested.S.idle },
        {
          getOwnPropertyDescriptor: (source, key) => {
            const descriptor = Object.getOwnPropertyDescriptor(source, key);
            return key === "target" &&
              descriptor !== undefined &&
              "value" in descriptor &&
              descriptorReads++ === 0
              ? { ...descriptor, value: OtherEditor.S.ready }
              : descriptor;
          },
        },
      );
      assertUnknownFailure(redirectWith(flappingDescriptor), "ExpectedRedirect", ["redirect"], {});
    });
  });
});
