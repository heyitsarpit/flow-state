import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./core/api/flow-core.js";
import { assertDurableFlowKey } from "./core/api/canonical-key.js";
import { createKey } from "./core/api/keys.js";

interface ProjectRecord {
  readonly id: string;
}

describe("canonical key hostile reflection", () => {
  it("normalizes metadata failures without invoking value hooks", () => {
    const cases = [
      {
        run: (metadataCalls, valueCalls) => {
          const hostileValue = new Proxy(
            {
              get value() {
                valueCalls.push("getter");
                return "boom";
              },
              toJSON: () => {
                valueCalls.push("toJSON");
                return "boom";
              },
            },
            {
              getPrototypeOf: () => {
                metadataCalls.push("getPrototypeOf");
                throw new Error("prototype trap");
              },
            },
          );
          const resource = flow.resource<[value: object], ProjectRecord>({
            id: "key.hostile-reflection.record",
            key: (value) => createKey(value),
            lookup: () => Effect.die("unused lookup"),
          });
          resource.ref(hostileValue);
        },
      },
      {
        run: (metadataCalls, valueCalls) => {
          const target: Array<unknown> = [];
          Object.defineProperty(target, 0, {
            enumerable: true,
            get: () => {
              valueCalls.push("getter");
              return "boom";
            },
          });
          const hostileKey = new Proxy(target, {
            getOwnPropertyDescriptor: (_target, key) => {
              metadataCalls.push(`getOwnPropertyDescriptor:${String(key)}`);
              throw new Error("property descriptor trap");
            },
          });
          assertDurableFlowKey(hostileKey);
        },
      },
    ] satisfies ReadonlyArray<
      Readonly<{
        readonly run: (metadataCalls: Array<string>, valueCalls: Array<string>) => void;
      }>
    >;

    for (const testCase of cases) {
      const metadataCalls: Array<string> = [];
      const valueCalls: Array<string> = [];

      expect(() => testCase.run(metadataCalls, valueCalls)).toThrow(
        expect.objectContaining({
          code: "FLOW-STORE-003",
          title: "Invalid resource key: uninspectable-object",
          debug: {
            field: "key",
            reason: "uninspectable-object",
          },
        }),
      );
      expect(metadataCalls.length).toBeGreaterThan(0);
      expect(valueCalls).toEqual([]);
    }
  });
});
