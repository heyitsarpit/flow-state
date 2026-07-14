import { describe, expect, it } from "vite-plus/test";

import { FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY } from "../api/inspection-event-vocabulary.js";
import { canonicalFactFamily, canonicalFactOutcomeKind } from "./canonical-receipt.js";

describe("canonical inspection facts", () => {
  it("classifies every declared fact through the shared family registry", () => {
    for (const [family, types] of Object.entries(FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY)) {
      for (const type of types) {
        expect(canonicalFactFamily(type)).toBe(family);
      }
    }
  });

  it("does not infer families or outcomes from lookalike prefixes and suffixes", () => {
    for (const type of [
      "actor:custom",
      "machine:custom",
      "resource:custom",
      "transaction:custom",
      "stream:custom",
      "timer:custom",
      "child:custom",
      "domain:failure",
    ]) {
      expect(canonicalFactFamily(type)).toBeUndefined();
      expect(canonicalFactOutcomeKind(type)).toBeUndefined();
    }
  });
});
