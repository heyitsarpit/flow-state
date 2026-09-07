import { assert, describe, it } from "@effect/vitest";
import { Option, Result } from "effect";

import { readTokenText } from "../reflection.js";

const inferredTokenRead: Result.Result<Option.Option<string>, undefined> = readTokenText(
  {},
  "kind",
);
void inferredTokenRead;

describe("token reflection", () => {
  it("returns Some for own string data properties", () => {
    const token = { kind: "state", id: "state-id", name: "idle" };
    for (const [key, expected] of [
      ["kind", "state"],
      ["id", "state-id"],
      ["name", "idle"],
    ] as const) {
      const result = readTokenText(token, key);
      if (Result.isFailure(result)) throw result.failure;
      assert.isTrue(Option.isSome(result.success));
      if (Option.isSome(result.success)) assert.strictEqual(result.success.value, expected);
    }
  });

  it("returns None for absent, non-string, and accessor-only fields without invoking getters", () => {
    let getterCalls = 0;
    const accessor = {};
    Object.defineProperty(accessor, "kind", {
      configurable: true,
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return "state";
      },
    });

    for (const [value, key] of [
      [{}, "kind"],
      [{ kind: undefined }, "kind"],
      [{ kind: null }, "kind"],
      [{ kind: 1 }, "kind"],
      [accessor, "kind"],
      [null, "kind"],
      [1, "kind"],
    ] as const) {
      const result = readTokenText(value, key);
      if (Result.isFailure(result)) throw result.failure;
      assert.isTrue(Option.isNone(result.success));
    }
    assert.strictEqual(getterCalls, 0);
  });

  it("reads one descriptor in order and preserves descriptor failures", () => {
    const reads: PropertyKey[] = [];
    const target = { kind: "state" };
    const proxy = new Proxy(target, {
      getOwnPropertyDescriptor: (source, key) => {
        reads.push(key);
        return Object.getOwnPropertyDescriptor(source, key);
      },
    });
    const result = readTokenText(proxy, "kind");
    if (Result.isFailure(result)) throw result.failure;
    assert.isTrue(Option.isSome(result.success));
    assert.deepStrictEqual(reads, ["kind"]);

    const throwing = new Proxy(target, {
      getOwnPropertyDescriptor: () => {
        throw new Error("descriptor failure");
      },
    });
    assert.isTrue(Result.isFailure(readTokenText(throwing, "kind")));

    const revoked = Proxy.revocable(target, {});
    revoked.revoke();
    assert.isTrue(Result.isFailure(readTokenText(revoked.proxy, "kind")));
  });
});
