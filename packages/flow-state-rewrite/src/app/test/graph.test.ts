import { assert, describe, it } from "@effect/vitest";
import { Option } from "effect";

import { definition } from "../../definition/definition.js";
import type { StateOf } from "../../definition/domain.js";
import type { MachineSelectorInput } from "../../machine/grammar.js";
import { machine } from "../../machine/machine.js";
import { app, appPlan, isOwnedMachineFactsFor, module } from "../app.js";
import { isOperationPlanForDescriptor } from "../../operation/operation.js";
import {
  AppValue,
  AppValuePlan,
  EditorModule,
  assertMutable,
  duplicateMachine,
  duplicateProjectResource,
  editorMachine,
  editorMachineVariant,
  invalidApp,
  invokeApp,
  projectActivity,
  projectResource,
  required,
  resultSuccess,
  sharedDescriptorMachine,
  viewerMachine,
} from "./fixtures.js";

describe("app composition", () => {
  describe("closed plan and graph laws", () => {
    // Rationale: plan construction stores no actor or callback execution and remains closed.
    it("compiles inert closed plans without creating actors or walking callbacks", () => {
      let initializerCalls = 0;

      const InertDefinitionResult = definition({
        id: "app-test/inert",
        states: ["ready"],
        events: {},
        memory: () => {
          initializerCalls += 1;

          return { ready: true };
        },
      });

      const InertMachine = resultSuccess(
        machine(InertDefinitionResult, ({ S }) => ({
          default: S.ready,
          states: { ready: {} },
        })),
      );

      const InertApp = app({
        id: "app-test/inert-app",
        persistenceVersion: "1",
        modules: [module({ id: "app-test/inert-module", machines: { inert: InertMachine } })],
      });

      const plan = appPlan(InertApp);

      assert.strictEqual(initializerCalls, 0);
      assert.strictEqual(plan.admitsMachine(InertMachine), true);
      assert.strictEqual(plan.resolveMachine("missing"), undefined);
    });

    it("preserves state-token identity when an exposed token gains branch-shaped data", () => {
      const state = editorMachine.definition.S.ready;
      assert.strictEqual(Reflect.set(state, "S", {}), true);

      try {
        const mutatedApp = app({
          id: "app-test/mutated-state-token",
          persistenceVersion: "1",
          modules: [EditorModule],
        });

        const facts = appPlan(mutatedApp).resolveMachineFacts(editorMachine);

        assert.ok(isOwnedMachineFactsFor(facts, editorMachine));

        if (isOwnedMachineFactsFor(facts, editorMachine))
          assert.strictEqual(facts.definition.S.ready, state);
      } finally {
        assert.strictEqual(Reflect.deleteProperty(state, "S"), true);
      }
    });

    it("copies only own compiled handlers into app-time machine facts", () => {
      const sourceRoot = required(Option.fromUndefinedOr(editorMachine.compiled.states[""]));
      const sourceHandlers = sourceRoot.handlers;
      const originalPrototype = Object.getPrototypeOf(sourceHandlers);
      const inheritedHandlers = { inherited: sourceHandlers.opened };

      Object.setPrototypeOf(sourceHandlers, inheritedHandlers);

      try {
        assert.strictEqual("inherited" in sourceHandlers, true);
        assert.strictEqual(Object.hasOwn(sourceHandlers, "inherited"), false);

        const mutatedApp = app({
          id: "app-test/inherited-handler",
          persistenceVersion: "1",
          modules: [EditorModule],
        });

        const facts = appPlan(mutatedApp).resolveMachineFacts(editorMachine);

        assert.ok(isOwnedMachineFactsFor(facts, editorMachine));

        if (isOwnedMachineFactsFor(facts, editorMachine)) {
          const capturedRoot = required(Option.fromUndefinedOr(facts.compiled.states[""]));
          assert.strictEqual(Object.hasOwn(capturedRoot.handlers, "inherited"), false);
        }
      } finally {
        Object.setPrototypeOf(sourceHandlers, originalPrototype);
      }
    });

    // App preserves retained identities without runtime freezes.
    it("preserves retained identities without freezing user values", () => {
      const ActivityDefinitionResult = definition({
        id: "app-test/activity-service",
        states: ["idle", "S", { active: ["editing"] }],
        events: { tick: "bare" },
        operations: { activity: projectResource },
        memory: () => ({ count: 0 }),
      });

      const ActivityDefinition = resultSuccess(ActivityDefinitionResult);
      const guard = Object.assign(() => true, { mutable: true });
      const updateMemory = Object.assign(() => ({ count: 1 }), { mutable: true });
      const actions = Object.assign(() => null, { mutable: true });
      const redirectWhen = Object.assign(() => true, { mutable: true });
      const timerGuard = Object.assign(() => true, { mutable: true });
      const timerUpdateMemory = Object.assign(() => ({ count: 1 }), { mutable: true });

      const contextSelector = (input: MachineSelectorInput<typeof ActivityDefinition>) =>
        input.state;

      const contextHandler = Object.assign(
        (
          _current: StateOf<typeof ActivityDefinition>,
          _previous: StateOf<typeof ActivityDefinition> | undefined,
        ) => null,
        { mutable: true },
      );

      const memoryHandler = Object.assign((_input: { memory: { count: number } }) => null, {
        mutable: true,
      });

      const memorySelector = (input: MachineSelectorInput<typeof ActivityDefinition>) =>
        input.memory.count;

      const memorySelectionHandler = Object.assign(
        (_current: number, _previous: number | undefined) => null,
        { mutable: true },
      );

      const ActivityMachine = resultSuccess(
        machine(ActivityDefinitionResult, ({ S, E, onContext, onMemory }) => {
          onContext.select(contextSelector, contextHandler);
          onMemory(memoryHandler);
          onMemory.select(memorySelector, memorySelectionHandler);

          return {
            default: S.idle,
            on: { tick: { target: S.idle, guard, updateMemory, actions } },
            redirect: { when: redirectWhen, target: S.idle },
            states: {
              idle: {},
              S: {},
              active: {
                default: S.active.S.editing,
                activities: { service: projectActivity },
                timers: {
                  refresh: {
                    delay: 1,
                    target: E.tick,
                    guard: timerGuard,
                    updateMemory: timerUpdateMemory,
                  },
                },
                states: { editing: {} },
              },
            },
          };
        }),
      );

      const ActivityApp = app({
        id: "app-test/activity-service-app",
        persistenceVersion: "1",
        modules: [
          module({
            id: "app-test/activity-service-module",
            machines: { activity: ActivityMachine },
          }),
        ],
      });

      const capturedActivityMachine = appPlan(ActivityApp).resolveMachineFacts(ActivityMachine);

      assert.ok(isOwnedMachineFactsFor(capturedActivityMachine, ActivityMachine));

      if (isOwnedMachineFactsFor(capturedActivityMachine, ActivityMachine)) {
        const sourceRoot = required(Option.fromUndefinedOr(ActivityMachine.compiled.states[""]));

        const capturedRoot = required(
          Option.fromUndefinedOr(capturedActivityMachine.compiled.states[""]),
        );

        const sourceTransitions = required(Option.fromUndefinedOr(sourceRoot.handlers.tick));
        const capturedTransitions = required(Option.fromUndefinedOr(capturedRoot.handlers.tick));
        const sourceTransition = required(Option.fromUndefinedOr(sourceTransitions[0]));
        const capturedTransition = required(Option.fromUndefinedOr(capturedTransitions[0]));
        const sourceRedirect = required(Option.fromUndefinedOr(sourceRoot.redirects[0]));
        const capturedRedirect = required(Option.fromUndefinedOr(capturedRoot.redirects[0]));

        const sourceActive = required(
          Option.fromUndefinedOr(ActivityMachine.compiled.states["S.active"]),
        );

        const capturedActive = required(
          Option.fromUndefinedOr(capturedActivityMachine.compiled.states["S.active"]),
        );

        const sourceTimer = required(Option.fromUndefinedOr(sourceActive.timers.refresh));
        const capturedTimer = required(Option.fromUndefinedOr(capturedActive.timers.refresh));
        const sourceActivity = sourceActive.activities.service;
        const capturedActivity = capturedActive.activities.service;
        const capturedStateNamedS = capturedActivityMachine.compiled.states['@["S"]'];

        assert.notStrictEqual(capturedTransition, sourceTransition);
        assert.notStrictEqual(capturedRedirect, sourceRedirect);
        assert.notStrictEqual(capturedTimer, sourceTimer);
        assert.strictEqual(capturedActivity, sourceActivity);
        assert.strictEqual(capturedTransition.guard, guard);
        assert.strictEqual(capturedRedirect.when, redirectWhen);
        assert.strictEqual(capturedTimer.guard, timerGuard);
        assert.strictEqual(isOperationPlanForDescriptor(capturedActivity, projectResource), true);
        assert.strictEqual(capturedActivityMachine.definition.S.S, ActivityDefinition.S.S);
        assert.ok(capturedStateNamedS !== undefined);
        assert.ok(capturedStateNamedS.kind === "leaf");
        assert.strictEqual(capturedStateNamedS.state, capturedActivityMachine.definition.S.S);
      }

      assert.strictEqual(Object.isFrozen(AppValue), false);
      assert.strictEqual(Object.isFrozen(AppValue.M.editor.definition), false);
      assert.strictEqual(Object.isFrozen(AppValue.M.editor.definition.S), false);
      assert.strictEqual(Object.isFrozen(AppValue.M.editor.definition.S.ready), false);

      const assertActivityGraph = () => {
        const compiled = ActivityApp.M.activity.compiled;
        const root = required(Option.fromUndefinedOr(compiled.states[""]));
        const active = required(Option.fromUndefinedOr(compiled.states["S.active"]));
        const transitions = required(Option.fromUndefinedOr(root.handlers.tick));
        const transition = required(Option.fromUndefinedOr(transitions[0]));
        const redirect = required(Option.fromUndefinedOr(root.redirects[0]));
        const timer = required(Option.fromUndefinedOr(active.timers.refresh));
        const contextRegistration = required(Option.fromUndefinedOr(compiled.context[0]));

        const memoryHandlerRegistration = required(
          Option.fromUndefinedOr(
            compiled.memory.find((registration) => registration.kind === "handler"),
          ),
        );

        const memorySelectionRegistration = required(
          Option.fromUndefinedOr(
            compiled.memory.find((registration) => registration.kind === "selection"),
          ),
        );

        assert.strictEqual(transition.guard, guard);
        assert.strictEqual(transition.updateMemory, updateMemory);
        assert.strictEqual(transition.actions, actions);
        assert.strictEqual(redirect.when, redirectWhen);
        assert.strictEqual(timer.guard, timerGuard);
        assert.strictEqual(timer.updateMemory, timerUpdateMemory);
        assert.strictEqual(active.activities.service, projectActivity);
        assert.strictEqual(
          contextRegistration.use((selector, handler) => {
            assert.strictEqual(Object.is(selector, contextSelector), true);
            assert.strictEqual(Object.is(handler, contextHandler), true);

            return true;
          }),
          true,
        );
        assert.strictEqual(memoryHandlerRegistration.handler, memoryHandler);
        assert.strictEqual(
          memorySelectionRegistration.use((selector, handler) => {
            assert.strictEqual(Object.is(selector, memorySelector), true);
            assert.strictEqual(Object.is(handler, memorySelectionHandler), true);

            return true;
          }),
          true,
        );
        assertMutable([
          guard,
          updateMemory,
          actions,
          redirectWhen,
          timerGuard,
          timerUpdateMemory,
          contextSelector,
          contextHandler,
          memoryHandler,
          memorySelector,
          memorySelectionHandler,
        ]);
        guard.mutable = false;
        assert.strictEqual(guard.mutable, false);
      };

      assertActivityGraph();
    });

    // Rationale: App indexes exact descriptor identities held by machine values.
    it("indexes only admitted descriptor identities", () => {
      const projectDescriptor = editorMachine.definition.operations.project;
      assert.strictEqual(AppValuePlan.resolveDescriptor(projectResource.id), projectDescriptor);
      assert.strictEqual(AppValuePlan.admitsDescriptor(projectDescriptor), true);
      assert.strictEqual(AppValuePlan.admitsDescriptor(projectResource), true);
      assert.strictEqual(AppValuePlan.admitsDescriptor(duplicateProjectResource), false);
      assert.throws(() =>
        app({
          id: "app-test/duplicate-descriptor-app",
          persistenceVersion: "1",
          modules: [
            EditorModule,
            module({ id: "app-test/duplicate-descriptor-module", machines: { duplicateMachine } }),
          ],
        }),
      );
    });

    it("accepts one descriptor identity reused by distinct definitions and machines", () => {
      const sharedApp = app({
        id: "app-test/shared-descriptor-app",
        persistenceVersion: "1",
        modules: [
          EditorModule,
          module({
            id: "app-test/shared-descriptor-module",
            machines: { shared: sharedDescriptorMachine },
          }),
        ],
      });

      assert.strictEqual(sharedApp.M.editor.definition.operations.project, projectResource);
      assert.strictEqual(sharedApp.M.shared.definition.operations.project, projectResource);
      assert.strictEqual(appPlan(sharedApp).resolveDescriptor(projectResource.id), projectResource);
    });

    it("rejects lossy machine registry reflection before publication", () => {
      const nonEnumerableMachines: Record<string, typeof editorMachine> = {};
      Object.defineProperty(nonEnumerableMachines, "editor", {
        configurable: true,
        enumerable: false,
        value: editorMachine,
      });
      assert.throws(() =>
        module({ id: "app-test/non-enumerable-machines", machines: nonEnumerableMachines }),
      );

      const accessorMachines: Record<string, typeof editorMachine> = {};
      Object.defineProperty(accessorMachines, "editor", {
        configurable: true,
        enumerable: true,
        get: () => editorMachine,
      });
      assert.throws(() => module({ id: "app-test/accessor-machines", machines: accessorMachines }));

      const symbolMachines: Record<string, typeof editorMachine> = {};
      Object.defineProperty(symbolMachines, Symbol("machine"), {
        enumerable: true,
        value: editorMachine,
      });
      assert.throws(() => module({ id: "app-test/symbol-machines", machines: symbolMachines }));

      const flappingSource = { editor: editorMachine };
      let keyReads = 0;

      const flappingMachines = new Proxy(flappingSource, {
        ownKeys: (target) => {
          keyReads += 1;

          return keyReads === 1 ? Reflect.ownKeys(target) : [];
        },
      });

      assert.throws(() => module({ id: "app-test/flapping-machines", machines: flappingMachines }));
      assert.strictEqual(keyReads, 2);

      assert.strictEqual(EditorModule.machines.editor, editorMachine);
    });

    it("rejects copied modules before indexing nested graph values", () => {
      const copiedModule = { ...EditorModule };
      assert.throws(() =>
        app({
          id: "app-test/copied-module-app",
          persistenceVersion: "1",
          modules: [copiedModule],
        }),
      );

      const copiedNestedModule = {
        ...EditorModule,
        machines: {
          editor: {
            ...editorMachine,
            operations: { project: { ...projectResource } },
          },
        },
      };

      assert.throws(() =>
        app({
          id: "app-test/copied-nested-module-app",
          persistenceVersion: "1",
          modules: [copiedNestedModule],
        }),
      );

      assert.strictEqual(AppValuePlan.admitsMachine(editorMachine), true);
    });

    it("reports a later malformed module before an earlier duplicate", () => {
      assert.throws(
        () =>
          invokeApp({
            id: "app-test/duplicate-before-malformed-module",
            persistenceVersion: "1",
            modules: [EditorModule, EditorModule, {}],
          }),
        /^App modules must be constructed module records$/u,
      );
    });

    // Rationale: machine admission requires the nominal compiler marker, not structural resemblance.
    it("rejects forged structural machines before admission", () => {
      const forgedMachine = { ...editorMachine };
      assert.throws(() =>
        module({ id: "app-test/forged-machine", machines: { forged: forgedMachine } }),
      );
      assert.strictEqual(AppValuePlan.admitsMachine(forgedMachine), false);
    });

    // Rationale: module keys, machine values, and machine IDs form one closed duplicate policy.
    it("rejects duplicate names and values at static graph compilation", () => {
      invalidApp([EditorModule, EditorModule]);
      invalidApp([
        module({ id: "app-test/duplicate-key-a", machines: { editor: editorMachine } }),
        module({ id: "app-test/duplicate-key-b", machines: { editor: viewerMachine } }),
      ]);
      invalidApp([
        module({ id: "app-test/duplicate-value-a", machines: { editor: editorMachine } }),
        module({ id: "app-test/duplicate-value-b", machines: { editor: editorMachine } }),
      ]);
      invalidApp([
        module({ id: "app-test/duplicate-id-a", machines: { editor: editorMachine } }),
        module({ id: "app-test/duplicate-id-b", machines: { editor: editorMachineVariant } }),
      ]);
    });

    // Rationale: composition exposes only named admitted machines and has no dynamic-root escape hatch.
    it("has no dynamic, automatic-root, or generic operation admission", () => {
      assert.strictEqual(Object.hasOwn(AppValue, "dynamicMachines"), false);
      assert.strictEqual(Object.hasOwn(AppValue.M, "missing"), false);
      assert.strictEqual(AppValuePlan.admitsMachine(viewerMachine), true);
    });
  });
});
