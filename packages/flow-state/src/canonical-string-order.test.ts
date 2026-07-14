import { describe, expect, it } from "vite-plus/test";

import { durableFlowKeyIdentity } from "./core/api/canonical-key.js";
import { createKey } from "./core/api/keys.js";
import * as flow from "./index.js";

describe("canonical string ordering", () => {
  it("uses ascending UTF-16 code-unit order for resource keys and app identity", () => {
    const cases = [
      {
        moduleIds: ["ä", "z"],
        record: { ä: 1, z: 2 },
        resourceIdentity: "a1[o2{s1:znum:2s1:änum:1}]",
        appIdentity: "app:1:z|1:ä",
      },
      {
        moduleIds: ["\uE000", "😀"],
        record: { "\uE000": 1, "😀": 2 },
        resourceIdentity: "a1[o2{s2:😀num:2s1:\uE000num:1}]",
        appIdentity: "app:2:😀|1:\uE000",
      },
      {
        moduleIds: ["é", "e\u0301"],
        record: { é: 1, "e\u0301": 2 },
        resourceIdentity: "a1[o2{s2:e\u0301num:2s1:énum:1}]",
        appIdentity: "app:2:e\u0301|1:é",
      },
    ] as const;

    const localeCompareDescriptor = Object.getOwnPropertyDescriptor(
      String.prototype,
      "localeCompare",
    );
    if (localeCompareDescriptor === undefined) {
      throw new Error("String.prototype.localeCompare is unavailable");
    }
    Object.defineProperty(String.prototype, "localeCompare", {
      ...localeCompareDescriptor,
      value: () => {
        throw new Error("canonical identity consulted host collation");
      },
    });
    try {
      for (const testCase of cases) {
        const actual = {
          resourceIdentity: durableFlowKeyIdentity(createKey(testCase.record)),
          appIdentity: flow.app({
            modules: testCase.moduleIds.map((id) => flow.module(id, {})),
          }).id,
        };

        expect(actual).toEqual({
          resourceIdentity: testCase.resourceIdentity,
          appIdentity: testCase.appIdentity,
        });
      }
    } finally {
      Object.defineProperty(String.prototype, "localeCompare", localeCompareDescriptor);
    }
  });
});
