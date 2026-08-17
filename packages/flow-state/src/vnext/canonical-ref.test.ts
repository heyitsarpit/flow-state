import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { copyCanonical, encodeCanonical, resource, tag, transaction } from "./index.js";

const expectCanonicalFailure = (value: unknown, reason: string): void => {
  try {
    copyCanonical(value);
    throw new Error("expected canonical validation to fail");
  } catch (error) {
    expect(error).toMatchObject({
      _tag: "FlowUsageError",
      code: "InvalidCanonicalValue",
      details: expect.objectContaining({ reason }),
    });
  }
};

describe("private vNext canonical refs", () => {
  it("uses descriptor ID plus the frozen exact resource argument tuple", () => {
    const byScope = resource({
      id: "records.by-scope",
      lookup: (scope: { readonly account: string; readonly region: string }) =>
        Effect.succeed(scope),
    });
    const firstInput = { account: "same", region: "west" };
    const first = byScope.ref(firstInput);
    const second = byScope.ref({ region: "east", account: "same" });
    const equal = byScope.ref({ region: "west", account: "same" });

    expect(first.identity).not.toBe(second.identity);
    expect(first.identity).toBe(equal.identity);
    expect(first.args).toEqual([{ account: "same", region: "west" }]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.args)).toBe(true);
    expect(Object.isFrozen(first.args[0])).toBe(true);

    firstInput.region = "mutated";
    expect(first.identity).toBe(equal.identity);
    expect(first.args[0]?.region).toBe("west");
  });

  it("keeps resource and transaction identity domains separate", () => {
    const singleton = transaction({ id: "records.refresh", commit: () => Effect.void });
    const keyed = transaction({
      id: "records.save",
      key: (params: { readonly id: string }) => ({ id: params.id }),
      commit: (_params: { readonly id: string }) => Effect.void,
    });

    expect(singleton.ref().key).toEqual([]);
    expect(keyed.ref({ id: "a" }).identity).toBe('["records.save",{"id":"a"}]');
    expect(() => Reflect.apply(singleton.ref, singleton, ["extra"])).toThrow();
  });

  it("creates immutable nominal tags without a second identity projection", () => {
    const first = tag("records");
    const equal = tag("records");
    expect(first.id).toBe(equal.id);
    expect(first.kind).toBe("tag");
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("encodes raw UTF-16 key order without locale normalization", () => {
    expect(encodeCanonical({ z: 1, A: 2, a: 3 })).toBe('{"A":2,"a":3,"z":1}');
    expect(encodeCanonical("é")).not.toBe(encodeCanonical("e\u0301"));
  });

  it("rejects hostile noncanonical values synchronously", () => {
    expectCanonicalFailure(-0, "number");
    expectCanonicalFailure(Number.NaN, "number");
    expectCanonicalFailure(Number.POSITIVE_INFINITY, "number");
    expectCanonicalFailure(undefined, "undefined");
    expectCanonicalFailure(1n, "bigint");
    expectCanonicalFailure(Symbol("key"), "symbol");
    expectCanonicalFailure(() => null, "function");
    expectCanonicalFailure("\ud800", "lone-surrogate");
    const sparse: unknown[] = [undefined, "hole"];
    Reflect.deleteProperty(sparse, "0");
    expectCanonicalFailure(sparse, "sparse-array");
    expectCanonicalFailure(new Date(), "prototype");
    expectCanonicalFailure(new Map(), "prototype");
    expectCanonicalFailure(new Set(), "prototype");

    const customArray: unknown[] = [];
    Object.setPrototypeOf(customArray, Object.create(Array.prototype));
    expectCanonicalFailure(customArray, "prototype");

    const numericLooking: unknown[] = [];
    Object.defineProperty(numericLooking, "4294967295", { enumerable: true, value: "hidden" });
    expectCanonicalFailure(numericLooking, "array-property");

    const cycle: unknown[] = [];
    cycle.push(cycle);
    expectCanonicalFailure(cycle, "cycle");

    const accessor = Object.create(null);
    Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
    expectCanonicalFailure(accessor, "property-descriptor");

    const reserved = Object.create(null);
    Object.defineProperty(reserved, "__proto__", { enumerable: true, value: "bad" });
    expectCanonicalFailure(reserved, "reserved-key");

    const symbolKey = { visible: true };
    Object.defineProperty(symbolKey, Symbol("hidden"), { enumerable: true, value: false });
    expectCanonicalFailure(symbolKey, "symbol-key");

    const throwing = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("reflection failed");
        },
      },
    );
    expectCanonicalFailure(throwing, "reflection");
  });

  it("enforces the shared durable-carrier bounds", () => {
    expectCanonicalFailure(
      Array.from({ length: 4_097 }, () => null),
      "array-bound",
    );
    expectCanonicalFailure("x".repeat(262_145), "string-bound");

    let nested: unknown = null;
    for (let depth = 0; depth < 33; depth += 1) nested = [nested];
    expectCanonicalFailure(nested, "depth-bound");

    expectCanonicalFailure(
      Object.fromEntries(Array.from({ length: 10_001 }, (_, index) => [`k${index}`, null])),
      "node-bound",
    );
    expectCanonicalFailure(
      Array.from({ length: 9 }, () => "x".repeat(250_000)),
      "encoded-bound",
    );
  });
});
