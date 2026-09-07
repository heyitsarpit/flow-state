import { assert, describe, it } from "@effect/vitest";

import { canonicalizeKey } from "../key.js";
import type { CanonicalKeyInput, OperationKey } from "../key.js";

const expectInvalidKey = (key: OperationKey, path: string) => {
  let error: unknown;
  try {
    canonicalizeKey(key);
  } catch (cause) {
    error = cause;
  }
  assert.strictEqual(error instanceof TypeError, true);
  if (error instanceof TypeError)
    assert.strictEqual(error.message, `Invalid canonical operation key at ${path}`);
};

const expectInvalidElement = (value: unknown, path: string) => {
  const key: OperationKey = [];
  Object.defineProperty(key, 0, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  expectInvalidKey(key, path);
};

describe("operation keys", () => {
  it("canonicalizes ordered values before publishing ownership", () => {
    const rawRecord = { z: "last", a: "first" };
    const rawKey: CanonicalKeyInput[] = [-0, rawRecord];
    const copy = canonicalizeKey(rawKey);

    rawKey[0] = 1;
    rawRecord.a = "changed";

    assert.deepStrictEqual(copy, [0, { a: "first", z: "last" }]);
    assert.strictEqual(Object.is(copy[0], 0), true);
    assert.strictEqual(Object.isFrozen(copy), true);
    assert.deepStrictEqual(canonicalizeKey([{ z: 1, a: 2 }]), canonicalizeKey([{ a: 2, z: 1 }]));

    const nestedRecord = { deep: ["stable"] };
    const nestedSource: [typeof nestedRecord] = [nestedRecord];
    const nestedCopy = canonicalizeKey(nestedSource);
    nestedRecord.deep[0] = "changed";
    assert.deepStrictEqual(nestedCopy, [{ deep: ["stable"] }]);
    assert.strictEqual(Object.isFrozen(nestedCopy), true);
    assert.strictEqual(Object.isFrozen(nestedCopy[0]), true);
    assert.strictEqual(Object.isFrozen(nestedCopy[0].deep), true);

    const nullRecord = Object.create(null);
    Object.defineProperty(nullRecord, "stable", {
      configurable: true,
      enumerable: true,
      value: true,
      writable: true,
    });
    assert.deepStrictEqual(canonicalizeKey([nullRecord]), [{ stable: true }]);

    const frozenRecord = { stable: true };
    Object.defineProperty(frozenRecord, "stable", {
      configurable: false,
      enumerable: true,
      value: true,
      writable: false,
    });
    Object.preventExtensions(frozenRecord);
    const frozenSource = [frozenRecord];
    Object.defineProperty(frozenSource, 0, {
      configurable: false,
      enumerable: true,
      value: frozenRecord,
      writable: false,
    });
    Object.defineProperty(frozenSource, "length", { writable: false });
    Object.preventExtensions(frozenSource);
    assert.deepStrictEqual(canonicalizeKey(frozenSource), [{ stable: true }]);

    const unicodeRecord = { "\uE000": true, "😀": true };
    const unicodeCopy = canonicalizeKey([unicodeRecord] as const);
    assert.deepStrictEqual(Object.keys(unicodeCopy[0]), ["😀", "\uE000"]);

    const immutableRecord = { stable: true };
    const immutableSource: CanonicalKeyInput[] = [immutableRecord];
    Object.defineProperty(immutableSource, "length", { writable: false });
    Object.defineProperty(immutableRecord, "stable", {
      configurable: false,
      enumerable: true,
      value: true,
      writable: false,
    });
    assert.deepStrictEqual(canonicalizeKey(immutableSource), [{ stable: true }]);
  });

  it("admits nested canonical containers", () => {
    assert.deepStrictEqual(canonicalizeKey([[{ stable: true }]] as const), [[{ stable: true }]]);
  });

  it("rejects unsupported values, accessors, and hostile reflection without invoking user code", () => {
    expectInvalidElement(undefined, "$[0]");
    expectInvalidElement(Number.NaN, "$[0]");
    expectInvalidElement(Number.POSITIVE_INFINITY, "$[0]");
    expectInvalidElement(1n, "$[0]");
    expectInvalidElement(Symbol("key"), "$[0]");
    expectInvalidElement(() => "key", "$[0]");
    expectInvalidElement("\uD800", "$[0]");
    expectInvalidElement("\uDC00", "$[0]");
    expectInvalidElement(new Date(0), "$[0]");

    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "secret";
      },
    });
    expectInvalidElement(accessor, "$[0][value]");
    assert.strictEqual(getterCalls, 0);

    let toJsonCalls = 0;
    const toJsonValue = {
      toJSON: () => {
        toJsonCalls += 1;
        return "secret";
      },
    };
    expectInvalidElement(toJsonValue, "$[0][toJSON]");
    assert.strictEqual(toJsonCalls, 0);

    let valueOfCalls = 0;
    const valueOfValue = {
      valueOf: () => {
        valueOfCalls += 1;
        return "secret";
      },
    };
    expectInvalidElement(valueOfValue, "$[0][valueOf]");
    assert.strictEqual(valueOfCalls, 0);

    let iteratorCalls = 0;
    const iterableValue = {
      [Symbol.iterator]: () => {
        iteratorCalls += 1;
        return [][Symbol.iterator]();
      },
    };
    expectInvalidElement(iterableValue, "$[0]");
    assert.strictEqual(iteratorCalls, 0);

    const cycle: CanonicalKeyInput[] = [];
    cycle.push(cycle);
    expectInvalidElement(cycle, "$[0][0]");

    const sparse: unknown[] = [];
    sparse.length = 1;
    expectInvalidElement(sparse, "$[0]");

    const extra = ["value"];
    Object.defineProperty(extra, "extra", { value: true });
    expectInvalidElement(extra, "$[0]");

    const symbolRecord = { [Symbol("secret")]: true };
    expectInvalidElement(symbolRecord, "$[0]");
    expectInvalidElement({ ["x".repeat(8191)]: true }, "$");

    const customPrototype = Object.create({ inherited: true });
    Object.defineProperty(customPrototype, "own", {
      enumerable: true,
      value: true,
    });
    expectInvalidElement(customPrototype, "$[0]");

    class Unsupported {
      readonly marker = true;
    }
    expectInvalidElement(new Unsupported(), "$[0]");

    const throwingReflection = new Proxy(
      { value: true },
      {
        ownKeys: () => {
          throw new Error("reflection failure");
        },
      },
    );
    expectInvalidElement(throwingReflection, "$[0]");

    const inconsistentReflection = new Proxy(
      { value: true },
      { getOwnPropertyDescriptor: () => undefined },
    );
    expectInvalidElement(inconsistentReflection, "$[0][value]");

    let proxyGetCalls = 0;
    const transparentProxy = Proxy.revocable(
      { value: true },
      {
        get: () => {
          proxyGetCalls += 1;
          return true;
        },
      },
    );
    assert.deepStrictEqual(canonicalizeKey([transparentProxy.proxy]), [{ value: true }]);
    assert.strictEqual(proxyGetCalls, 0);
    transparentProxy.revoke();
    expectInvalidElement(transparentProxy.proxy, "$[0]");

    const sparseArray: unknown[] = [];
    sparseArray.length = 1;
    const sparseProxy = new Proxy(sparseArray, {});
    expectInvalidElement(sparseProxy, "$[0]");

    const mutatedSymbol = Symbol("mutated");
    const mutatingReflection = new Proxy(
      { value: true },
      {
        ownKeys: (target) => {
          Object.defineProperty(target, mutatedSymbol, {
            configurable: true,
            enumerable: true,
            value: true,
            writable: true,
          });
          return Reflect.ownKeys(target);
        },
      },
    );
    expectInvalidElement(mutatingReflection, "$[0]");
  });

  it("enforces exact depth, node, and UTF-8 byte boundaries", () => {
    let depthLimit: CanonicalKeyInput = "leaf";
    for (let index = 0; index < 15; index += 1) depthLimit = [depthLimit];
    assert.doesNotThrow(() => canonicalizeKey([depthLimit]));

    const tooDeep: CanonicalKeyInput = [depthLimit];
    expectInvalidElement(tooDeep, `$${"[0]".repeat(17)}`);

    const nodeLimit: CanonicalKeyInput[] = [];
    for (let index = 0; index < 256; index += 1) nodeLimit.push(index);
    assert.doesNotThrow(() => canonicalizeKey(nodeLimit));
    const nextNode = [...nodeLimit, 256];
    expectInvalidKey(nextNode, "$[256]");

    const utf8Limit = "😀".repeat(2047);
    assert.doesNotThrow(() => canonicalizeKey([utf8Limit]));
    expectInvalidElement(`${utf8Limit}x`, "$");
  });
});
