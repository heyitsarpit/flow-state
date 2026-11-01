import { assert, describe, it } from "@effect/vitest";
import { Effect, Stream } from "effect";

import { resource } from "../resource.js";
import { stream } from "../stream.js";
import { transaction } from "../transaction.js";
import type { OperationKey } from "../key.js";
import { isStableDataDescriptor, isStableKeyList } from "../../internal/stable-observation.js";

describe("stable observation comparisons", () => {
  it("compares reflected keys by length and order", () => {
    const symbol = Symbol("key");

    assert.strictEqual(isStableKeyList(["name", symbol], ["name", symbol]), true);
    assert.strictEqual(isStableKeyList(["name", symbol], [symbol, "name"]), false);
    assert.strictEqual(isStableKeyList(["name"], ["name", symbol]), false);
  });

  it("compares data descriptors without executing accessors", () => {
    const stable = {
      configurable: true,
      enumerable: true,
      value: Number.NaN,
      writable: true,
    };

    let getterCalls = 0;

    const accessor = {
      configurable: true,
      enumerable: true,
      get: () => {
        getterCalls += 1;

        return Number.NaN;
      },
    };

    assert.strictEqual(isStableDataDescriptor(stable, stable), true);
    assert.strictEqual(isStableDataDescriptor(stable, { ...stable, value: Number.NaN }), true);
    assert.strictEqual(isStableDataDescriptor(stable, { ...stable, value: -0 }), false);
    assert.strictEqual(isStableDataDescriptor(stable, accessor), false);
    assert.strictEqual(getterCalls, 0);
  });
});

describe("operation executable input ownership", () => {
  it("copies executable params before projecting keys across every family", () => {
    class Client {
      tag = "client";
    }

    type Params = {
      scope: { id: string; tags: string[] };
      client: Client;
      callback: () => string;
    };

    const makeParams = () => ({
      scope: { id: "project-1", tags: ["stable"] },
      client: new Client(),
      callback: () => "stable",
    });

    const assertSnapshot = (input: Params, plan: { params: Params; key: OperationKey }) => {
      input.scope.id = "project-2";
      input.scope.tags[0] = "changed";

      assert.deepStrictEqual(plan.params.scope, { id: "project-1", tags: ["stable"] });
      assert.deepStrictEqual(plan.key, ["project-1"]);
      assert.strictEqual(plan.params.client, input.client);
      assert.strictEqual(plan.params.callback, input.callback);
      assert.strictEqual(Object.isFrozen(plan.params.client), false);
      assert.strictEqual(Object.isFrozen(plan), false);
      assert.strictEqual(Object.isFrozen(plan.params), false);
      assert.strictEqual(Object.isFrozen(plan.params.scope), false);
      assert.strictEqual(Object.isFrozen(plan.params.scope.tags), false);
      plan.params.scope.id = "mutable-owned-copy";
      assert.strictEqual(input.scope.id, "project-2");
    };

    const resourceInput = makeParams();

    const project = resource({
      id: "projects.snapshot-resource",
      key: (params: Params) => [params.scope.id] as const,
      lookup: (params: Params) => Effect.succeed(params.scope.id),
    });

    assertSnapshot(resourceInput, project.lookup(resourceInput));

    const transactionInput = makeParams();

    const save = transaction({
      id: "projects.snapshot-transaction",
      key: (params: Params) => [params.scope.id] as const,
      commit: (params: Params) => Effect.succeed(params.scope.id),
    });

    assertSnapshot(transactionInput, save.commit(transactionInput));

    const streamInput = makeParams();

    const updates = stream({
      id: "projects.snapshot-stream",
      key: (params: Params) => [params.scope.id] as const,
      subscribe: (params: Params) => Stream.make(params.scope.id),
    });

    assertSnapshot(streamInput, updates.subscribe(streamInput));

    const shared = { id: "shared" };
    const sharedInput = { left: shared, right: shared };

    const sharedResource = resource({
      id: "projects.snapshot-shared",
      key: (params: typeof sharedInput) => [params.left.id] as const,
      lookup: () => Effect.succeed("shared"),
    });

    const sharedPlan = sharedResource.lookup(sharedInput);
    assert.strictEqual(sharedPlan.params.left, sharedPlan.params.right);
    assert.strictEqual(Object.isFrozen(sharedPlan.params.left), false);
  });

  it("rejects cycles, malformed containers, accessors, and hostile reflection", () => {
    type InputSlot<Value> = { state: "absent" } | { state: "present"; value: Value };

    type Params = {
      value: string;
      parts: InputSlot<string[]>;
      nested: InputSlot<Params>;
    };

    const absentParts: InputSlot<string[]> = { state: "absent" };
    const absentNested: InputSlot<Params> = { state: "absent" };

    const project = resource({
      id: "projects.snapshot-validation",
      key: (params: Params) => [params.value] as const,
      lookup: () => Effect.succeed("ok"),
    });

    const expectRejected = (params: Params) => {
      assert.throws(() => project.lookup(params), TypeError);
    };

    const cycle: Params = { value: "cycle", parts: absentParts, nested: absentNested };
    cycle.nested = { state: "present", value: cycle };
    expectRejected(cycle);

    const sparse: string[] = [];
    sparse.length = 1;
    expectRejected({
      value: "sparse",
      parts: { state: "present", value: sparse },
      nested: absentNested,
    });

    const extra = Object.assign(["part"], { extra: "unexpected" });
    expectRejected({
      value: "extra",
      parts: { state: "present", value: extra },
      nested: absentNested,
    });

    const symbolParts = ["part"];
    Object.defineProperty(symbolParts, Symbol("extra"), {
      configurable: true,
      enumerable: true,
      value: "unexpected",
      writable: true,
    });
    expectRejected({
      value: "symbol-array",
      parts: { state: "present", value: symbolParts },
      nested: absentNested,
    });

    const symbolRecord = { value: "symbol-record", [Symbol("extra")]: "unexpected" };
    expectRejected({ ...symbolRecord, parts: absentParts, nested: absentNested });

    let getterCalls = 0;

    const accessor: Params = {
      value: "placeholder",
      parts: absentParts,
      nested: absentNested,
    };

    Object.defineProperty(accessor, "value", {
      configurable: true,
      enumerable: true,
      get: () => {
        getterCalls += 1;

        return "secret";
      },
    });
    expectRejected(accessor);
    assert.strictEqual(getterCalls, 0);

    const revoked = Proxy.revocable(
      { value: "revoked", parts: absentParts, nested: absentNested },
      {},
    );

    revoked.revoke();
    expectRejected(revoked.proxy);

    let reflectionCalls = 0;

    const inconsistent = new Proxy(
      { value: "inconsistent", parts: absentParts, nested: absentNested },
      {
        ownKeys: (target) => {
          reflectionCalls += 1;

          return reflectionCalls === 1 ? Reflect.ownKeys(target) : [];
        },
      },
    );

    expectRejected(inconsistent);
  });

  it("accepts a transparent proxy through the bounded reflection walk", () => {
    const project = resource({
      id: "projects.snapshot-transparent-proxy",
      key: () => ["transparent-proxy"] as const,
      lookup: () => Effect.succeed("ok"),
    });

    const proxy = new Proxy({ value: "proxy" }, {});

    const plan = project.lookup(proxy);

    assert.deepStrictEqual(plan.params, { value: "proxy" });
  });

  it("passes an owned copy of params to key before canonical admission", () => {
    type Params = { nested: { value: string } };

    const input: Params = { nested: { value: "stable" } };
    const order: string[] = [];
    let keyParams: Params | undefined;

    const project = resource({
      id: "projects.snapshot-before-key",
      key: (params: Params) => {
        order.push("key");
        keyParams = params;
        assert.notStrictEqual(params, input);
        assert.strictEqual(Object.isFrozen(params), false);
        assert.strictEqual(Object.isFrozen(params.nested), false);
        input.nested.value = "changed-before-k";

        return [params.nested.value] as const;
      },
      lookup: () => Effect.succeed("ok"),
    });

    const plan = project.lookup(input);

    assert.deepStrictEqual(order, ["key"]);
    assert.strictEqual(keyParams, plan.params);
    assert.deepStrictEqual(plan.key, ["stable"]);
    assert.deepStrictEqual(plan.params, { nested: { value: "stable" } });
  });

  it("retains function leaves without invoking them", () => {
    let calls = 0;

    const leaf = () => {
      calls += 1;
      throw new Error("function leaf invoked");
    };

    const input = { leaf };

    const project = resource({
      id: "projects.snapshot-function-leaf",
      key: (params: typeof input) => {
        assert.strictEqual(params.leaf, leaf);

        return ["function-leaf"] as const;
      },
      lookup: () => Effect.succeed("ok"),
    });

    const plan = project.lookup(input);

    assert.strictEqual(calls, 0);
    assert.strictEqual(plan.params.leaf, leaf);
  });

  it("rejects flapping plain records even when opaque leaves are allowed", () => {
    class Client {
      tag = "client";
    }

    const callback = () => "stable";
    const client = new Client();
    let descriptorReads = 0;

    const flapping = new Proxy(
      { callback, client },
      {
        getOwnPropertyDescriptor: (target, key) => {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);

          if (key !== "callback" || descriptor === undefined) return descriptor;
          descriptorReads += 1;

          return {
            ...descriptor,
            value: descriptorReads === 1 ? callback : () => "changed",
          };
        },
      },
    );

    const project = resource({
      id: "projects.snapshot-flapping-opaque",
      key: () => ["flapping"] as const,
      lookup: () => Effect.succeed("ok"),
    });

    assert.throws(() => project.lookup({ flapping }), TypeError);
    assert.strictEqual(descriptorReads, 2);
  });

  it("rejects source mutation during final reflection", () => {
    class Client {
      tag = "client";
    }

    const callback = () => "stable";
    const client = new Client();
    let ownKeysReads = 0;
    const target = { value: "original", callback, client };

    const flapping = new Proxy(target, {
      ownKeys: (source) => {
        ownKeysReads += 1;

        if (ownKeysReads === 3) source.value = "changed";

        return Reflect.ownKeys(source);
      },
    });

    const project = resource({
      id: "projects.snapshot-final-reflection",
      key: () => ["final-reflection"] as const,
      lookup: () => Effect.succeed("ok"),
    });

    assert.throws(() => project.lookup({ flapping }), TypeError);
    assert.strictEqual(target.value, "changed");
    assert.strictEqual(ownKeysReads, 4);
  });

  it("rejects a shared node changed by a later sibling reflection", () => {
    class Client {
      tag = "client";
    }

    const callback = () => "stable";
    const client = new Client();
    const shared = { value: "original" };
    let ownKeysReads = 0;

    const mutator = new Proxy(
      { callback, client },
      {
        ownKeys: (source) => {
          ownKeysReads += 1;

          if (ownKeysReads === 3) shared.value = "changed";

          return Reflect.ownKeys(source);
        },
      },
    );

    const project = resource({
      id: "projects.snapshot-shared-mutation",
      key: () => ["shared-mutation"] as const,
      lookup: () => Effect.succeed("ok"),
    });

    assert.throws(() => project.lookup({ shared, mutator }), TypeError);
    assert.strictEqual(shared.value, "changed");
    assert.strictEqual(ownKeysReads, 4);
  });

  it("snapshots deep ordinary parameters without recursive stack growth", () => {
    type InputSlot<Value> = { state: "absent" } | { state: "present"; value: Value };

    type Deep = { next: InputSlot<Deep>; value: InputSlot<string> };

    const absentNext: InputSlot<Deep> = { state: "absent" };
    const absentValue: InputSlot<string> = { state: "absent" };

    const depth = 2_048;

    let input: Deep = {
      next: absentNext,
      value: { state: "present", value: "leaf" },
    };

    for (let index = 0; index < depth; index += 1) {
      input = { next: { state: "present", value: input }, value: absentValue };
    }

    const project = resource({
      id: "projects.snapshot-deep",
      key: (_params: Deep) => ["deep"] as const,
      lookup: () => Effect.succeed("ok"),
    });

    const plan = project.lookup(input);
    assert.deepStrictEqual(plan.key, ["deep"]);

    let cursor: Deep = plan.params;

    for (let index = 0; index < depth; index += 1) {
      assert.strictEqual(Object.isFrozen(cursor), false);

      if (cursor.next.state === "absent") throw new Error("deep snapshot ended early");
      cursor = cursor.next.value;
    }

    assert.deepStrictEqual(cursor, {
      next: absentNext,
      value: { state: "present", value: "leaf" },
    });
    assert.strictEqual(Object.isFrozen(cursor), false);
  });
});
