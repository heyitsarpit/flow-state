import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  app,
  child,
  definition,
  machine,
  module,
  resource,
  stream,
  transaction,
  view,
} from "./index.js";

describe("private vNext AppPlan", () => {
  it("compiles the closed transitive graph without executing client callbacks", () => {
    const calls = {
      memory: 0,
      lookup: 0,
      tags: 0,
      placeholder: 0,
      key: 0,
      preview: 0,
      commit: 0,
      invalidates: 0,
      subscribe: 0,
      guard: 0,
      selector: 0,
      outcome: 0,
    };
    const lookup = resource({
      id: "plan.lookup",
      lookup: (id: string) => {
        calls.lookup += 1;
        return Effect.succeed(id);
      },
      tags: () => {
        calls.tags += 1;
        return [];
      },
      placeholder: (id) => {
        calls.placeholder += 1;
        return id;
      },
    });
    const commit = transaction({
      id: "plan.commit",
      key: (input: { readonly id: string }) => {
        calls.key += 1;
        return input.id;
      },
      preview: {
        apply: () => {
          calls.preview += 1;
          return [];
        },
      },
      invalidates: () => {
        calls.invalidates += 1;
        return [];
      },
      commit: (input: { readonly id: string }) => {
        calls.commit += 1;
        return Effect.succeed(input.id);
      },
    });
    const updates = stream({
      id: "plan.updates",
      subscribe: () => {
        calls.subscribe += 1;
        return Stream.empty;
      },
    });

    const ChildDefinition = definition({
      id: "Plan/Child",
      states: ["ACTIVE"],
      events: {},
      memory: ({ input }: { readonly input: { readonly id: string } }) => {
        calls.memory += 1;
        return { id: input.id };
      },
    });
    const childMachine = machine(ChildDefinition, ({ S, activity }) => ({
      initial: S.ACTIVE,
      states: {
        ACTIVE: { activities: [activity.ensure(lookup, { params: ({ memory }) => [memory.id] })] },
      },
    }));
    const childBinding = child({ id: "plan.child", machine: childMachine });

    const dynamicLookup = resource({
      id: "plan.dynamic-lookup",
      lookup: (id: string) => Effect.succeed(id),
    });
    const DynamicDefinition = definition({
      id: "Plan/DynamicOnly",
      states: ["ACTIVE"],
      events: {},
      memory: ({ input }: { readonly input: { readonly id: string } }) => ({ id: input.id }),
    });
    const dynamicOnly = machine(DynamicDefinition, ({ S, activity }) => ({
      initial: S.ACTIVE,
      states: {
        ACTIVE: {
          activities: [activity.ensure(dynamicLookup, { params: ({ memory }) => [memory.id] })],
        },
      },
    }));

    const RootDefinition = definition({
      id: "Plan/Root",
      states: ["ACTIVE"],
      events: { Complete: null },
      memory: () => {
        calls.memory += 1;
        return { id: "root" };
      },
    });
    const root = machine(RootDefinition, ({ S, E, activity }) => ({
      initial: S.ACTIVE,
      states: {
        ACTIVE: {
          redirect: {
            when: () => {
              calls.guard += 1;
              return false;
            },
            target: S.ACTIVE,
          },
          activities: [
            activity.run(commit, {
              params: ({ memory }) => ({ id: memory.id }),
              outcomes: {
                success: () => {
                  calls.outcome += 1;
                  return E.Complete();
                },
              },
            }),
            activity.stream(updates, {}),
            activity.child(childBinding, {
              input: ({ memory }) => ({ id: memory.id }),
              key: ({ id }) => id,
            }),
          ],
          timers: { timeout: { delay: "1 second", target: S.ACTIVE } },
        },
      },
    }));
    const rootView = view(root, {
      id: "plan.root-view",
      select: ({ memory }) => {
        calls.selector += 1;
        return memory.id;
      },
    });
    const rootModule = module({ id: "Plan", machines: [root], views: [rootView] });
    const compiled = app({
      id: "plan-app",
      persistenceVersion: "1",
      modules: [rootModule],
      dynamicMachines: [dynamicOnly, dynamicOnly],
    });

    expect(calls).toEqual({
      memory: 0,
      lookup: 0,
      tags: 0,
      placeholder: 0,
      key: 0,
      preview: 0,
      commit: 0,
      invalidates: 0,
      subscribe: 0,
      guard: 0,
      selector: 0,
      outcome: 0,
    });
    expect(compiled.plan.roots).toEqual([root]);
    expect(compiled.plan.dynamicMachines).toEqual([dynamicOnly]);
    expect(compiled.plan.machines).toEqual([root, childMachine, dynamicOnly]);
    expect(compiled.plan.descriptors).toEqual([
      commit,
      updates,
      childBinding,
      lookup,
      dynamicLookup,
    ]);
    expect(compiled.plan.admitsCreation(dynamicOnly)).toBe(true);
    expect(compiled.plan.isRoot(dynamicOnly)).toBe(false);
    expect(compiled.plan.rootActorId(root)).toBe("root|8:plan-app|9:Plan/Root");
    expect(compiled.plan.resolveView("plan.root-view")).toBe(rootView);
    expect(compiled.plan.resolveDescriptor("plan.lookup")).toBe(lookup);
    expect(compiled.plan.activitySlots).toEqual([
      {
        kind: "activity",
        machineId: "Plan/Child",
        stateId: "S|10:Plan/Child|6:ACTIVE",
        activityKind: "ensure",
        ordinal: 0,
        descriptorId: "plan.lookup",
      },
      {
        kind: "activity",
        machineId: "Plan/Root",
        stateId: "S|9:Plan/Root|6:ACTIVE",
        activityKind: "transaction",
        ordinal: 0,
        descriptorId: "plan.commit",
      },
      {
        kind: "activity",
        machineId: "Plan/Root",
        stateId: "S|9:Plan/Root|6:ACTIVE",
        activityKind: "stream",
        ordinal: 1,
        descriptorId: "plan.updates",
      },
      {
        kind: "activity",
        machineId: "Plan/Root",
        stateId: "S|9:Plan/Root|6:ACTIVE",
        activityKind: "child",
        ordinal: 2,
        descriptorId: "plan.child",
      },
      {
        kind: "activity",
        machineId: "Plan/DynamicOnly",
        stateId: "S|16:Plan/DynamicOnly|6:ACTIVE",
        activityKind: "ensure",
        ordinal: 0,
        descriptorId: "plan.dynamic-lookup",
      },
    ]);
    expect(compiled.plan.timerSlots).toEqual([
      {
        kind: "timer",
        machineId: "Plan/Root",
        stateId: "S|9:Plan/Root|6:ACTIVE",
        name: "timeout",
      },
    ]);
    expect(Object.isFrozen(compiled.plan)).toBe(true);
    expect(Object.isFrozen(compiled.plan.machines)).toBe(true);
  });

  it("copies all presented tuples and exposes no registration surface", () => {
    const D = definition({ id: "Plan/Immutable", states: ["READY"], events: {} });
    const root = machine(D, ({ S }) => ({ initial: S.READY, states: { READY: {} } }));
    const roots: [typeof root] = [root];
    const views: [] = [];
    const owner = module({ id: "Immutable", machines: roots, views });
    const modules: [typeof owner] = [owner];
    const compiled = app({ id: "immutable", persistenceVersion: "1", modules });
    roots.pop();
    modules.pop();

    expect(compiled.plan.roots).toEqual([root]);
    expect(compiled.plan.modules).toEqual([owner]);
    expect("register" in compiled.plan).toBe(false);
    expect("layer" in compiled).toBe(false);
  });

  it("copies nested callback containers before closing the plan", () => {
    const D = definition({
      id: "Plan/FrozenCallbacks",
      states: ["READY"],
      events: { Done: null },
    });
    const firstGuard = () => false;
    const replacementGuard = () => true;
    const firstOutcome = () => D.E.Done();
    const replacementOutcome = () => D.E.Done();
    const redirect = { when: firstGuard, target: D.S.READY };
    const outcomes = { success: firstOutcome };
    const preview = { apply: () => [] as const };
    const commit = transaction({ id: "plan.frozen-commit", preview, commit: () => Effect.void });
    const root = machine(D, ({ S, activity }) => ({
      initial: S.READY,
      states: {
        READY: { redirect, activities: [activity.run(commit, { outcomes })] },
      },
    }));
    const compiled = app({
      id: "frozen-callbacks",
      persistenceVersion: "1",
      modules: [module({ id: "FrozenCallbacks", machines: [root], views: [] })],
    });
    const fingerprint = compiled.plan.persistenceFingerprint;

    redirect.when = replacementGuard;
    outcomes.success = replacementOutcome;
    preview.apply = () => [];

    const retainedRedirect = root.states.READY?.redirect;
    const retainedBinding = root.states.READY?.activities?.[0];
    const retainedOptions =
      retainedBinding === undefined ? undefined : Reflect.get(retainedBinding, "options");
    expect(Reflect.get(retainedRedirect ?? {}, "when")).toBe(firstGuard);
    expect(Reflect.get(Reflect.get(retainedOptions ?? {}, "outcomes") ?? {}, "success")).toBe(
      firstOutcome,
    );
    expect(commit.preview?.apply).not.toBe(preview.apply);
    expect(compiled.plan.persistenceFingerprint).toBe(fingerprint);
  });
});
