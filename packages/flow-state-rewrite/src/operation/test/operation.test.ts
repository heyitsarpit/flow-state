import { assert, describe, it } from "@effect/vitest";
import { Effect, Stream } from "effect";

import { OperationAdapterTypeId } from "../operation.js";
import { resource } from "../resource.js";
import { stream } from "../stream.js";
import { transaction } from "../transaction.js";
import type { CanonicalKeyInput } from "../key.js";
import type { OperationOptions } from "../operation.js";

type ProjectInput = { readonly id: string };

describe("operation declarations", () => {
  it("retain adapters without executing them during construction or planning", () => {
    let lookupCalls = 0;
    const lookup = (params: ProjectInput, _options: OperationOptions) => {
      lookupCalls += 1;
      return Effect.succeed({ id: params.id });
    };
    const project = resource({
      id: "projects.by-id",
      key: (params: ProjectInput) => [params.id] as const,
      lookup,
    });

    assert.strictEqual(lookupCalls, 0);
    assert.strictEqual(project[OperationAdapterTypeId].lookup, lookup);
    const lookupOptions = {};
    const subscribeOptions = {};
    const refetchOptions = {};
    const plan = project.lookup({ id: "project-1" }, lookupOptions);
    const subscribePlan = project.subscribe({ id: "project-1" }, subscribeOptions);
    const refetchPlan = project.refetch({ id: "project-1" }, refetchOptions);
    assert.strictEqual(lookupCalls, 0);
    assert.deepStrictEqual(plan.key, ["project-1"]);
    assert.strictEqual(plan.options, lookupOptions);
    assert.strictEqual(subscribePlan.options, subscribeOptions);
    assert.strictEqual(refetchPlan.options, refetchOptions);
    const write = project.setData(["project-1"], { id: "project-1" });
    const cancellation = project.cancel(["project-1"]);
    assert.strictEqual(write.descriptor, "projects.by-id");
    assert.strictEqual(write.family, "resource");
    assert.strictEqual(cancellation.descriptor, "projects.by-id");
    assert.strictEqual(cancellation.family, "resource");
    assert.deepStrictEqual(project.getData(["project-1"]), undefined);
    assert.deepStrictEqual(project.getState(["project-1"]), {
      status: "missing",
      key: ["project-1"],
    });
    assert.strictEqual("staleTime" in project, false);
    assert.strictEqual("gcTime" in project, false);

    const configuredProject = resource({
      id: "projects.configured",
      key: (params: ProjectInput) => [params.id] as const,
      lookup,
      staleTime: 1_000,
      gcTime: 2_000,
      persist: true,
    });
    assert.strictEqual(configuredProject.staleTime, 1_000);
    assert.strictEqual(configuredProject.gcTime, 2_000);
    assert.strictEqual(configuredProject.persist, true);
  });

  it("carries the exact key on parameterized and constant-key commit plans", () => {
    let commitCalls = 0;
    const commit = (params: ProjectInput, _options: OperationOptions) => {
      commitCalls += 1;
      return Effect.succeed({ id: params.id });
    };
    const save = transaction({
      id: "projects.save",
      key: (params: ProjectInput) => [params.id] as const,
      commit,
      persist: true,
      concurrency: "serialize",
    });
    const keyedPlan = save.commit({ id: "project-1" });
    const refresh = transaction({
      id: "projects.refresh",
      key: () => ["refresh"] as const,
      commit: () => Effect.succeed({ refreshed: true }),
    });

    assert.strictEqual(commitCalls, 0);
    assert.strictEqual(save[OperationAdapterTypeId].commit, commit);
    assert.strictEqual(save.persist, true);
    assert.strictEqual(save.concurrency, "serialize");
    assert.deepStrictEqual(keyedPlan.key, ["project-1"]);
    assert.strictEqual("options" in keyedPlan, false);
    const keyedCancellation = save.cancel(["project-1"]);
    assert.strictEqual(keyedCancellation.descriptor, "projects.save");
    assert.strictEqual(keyedCancellation.family, "transaction");
    assert.deepStrictEqual(refresh.key(undefined), ["refresh"]);
    assert.deepStrictEqual(refresh.commit(undefined).key, ["refresh"]);
    const refreshOptions = {};
    const refreshPlan = refresh.commit(undefined, refreshOptions);
    assert.strictEqual(refreshPlan.params, undefined);
    assert.strictEqual(refreshPlan.options, refreshOptions);
    assert.deepStrictEqual(save.getState(["project-1"]), {
      status: "idle",
      key: ["project-1"],
    });
  });

  it("retains stream subscriptions and exposes no cancel action", () => {
    let subscribeCalls = 0;
    const subscribe = (params: ProjectInput, _options: OperationOptions) => {
      subscribeCalls += 1;
      return Stream.make({ id: params.id });
    };
    const updates = stream({
      id: "projects.updates",
      key: (params: ProjectInput) => [params.id] as const,
      subscribe,
      persist: true,
    });
    const options = {};
    const plan = updates.subscribe({ id: "project-1" }, options);

    assert.strictEqual(subscribeCalls, 0);
    assert.strictEqual(updates[OperationAdapterTypeId].subscribe, subscribe);
    assert.deepStrictEqual(plan.key, ["project-1"]);
    assert.strictEqual(plan.options, options);
    assert.deepStrictEqual(updates.getState(["project-1"]), {
      status: "idle",
      key: ["project-1"],
      generation: null,
      hasValue: false,
      emissionCount: 0,
    });
    assert.strictEqual(updates.persist, true);
    assert.strictEqual("cancel" in updates, false);
  });

  it("captures descriptor config and publishes copied canonical keys", () => {
    const rawKey: CanonicalKeyInput[] = [-0, { z: "last", a: "first" }];
    const config = {
      id: "projects.captured",
      key: (_params: ProjectInput) => rawKey,
      lookup: (params: ProjectInput, _options: OperationOptions) =>
        Effect.succeed({ id: params.id }),
    };
    const captured = resource(config);
    const plan = captured.lookup({ id: "project-1" });

    rawKey[0] = 1;
    config.id = "projects.changed";
    config.key = () => ["changed"];

    assert.strictEqual(plan.descriptor, "projects.captured");
    assert.deepStrictEqual(plan.key, [0, { a: "first", z: "last" }]);
    assert.strictEqual(Object.isFrozen(plan.key), true);
    assert.strictEqual(Object.isFrozen(plan.key[1]), true);
    assert.throws(
      () =>
        resource({
          id: "projects.invalid-key",
          key: () => [undefined] as unknown as readonly [string],
          lookup: (params: ProjectInput, _options: OperationOptions) =>
            Effect.succeed({ id: params.id }),
        }).lookup({ id: "project-1" }),
      TypeError,
    );
  });

  it("uses the default empty key and forwards adapter options", () => {
    let receivedOptions: OperationOptions | undefined;
    const refresh = transaction({
      id: "projects.refresh-default",
      commit: (options: OperationOptions) => {
        receivedOptions = options;
        return Effect.succeed({ refreshed: true });
      },
    });
    const options = { signal: new AbortController().signal };

    assert.deepStrictEqual(refresh.key(undefined), []);
    assert.deepStrictEqual(refresh.commit(undefined).key, []);
    void refresh[OperationAdapterTypeId].commit(options);
    assert.strictEqual(receivedOptions, options);
  });
});
