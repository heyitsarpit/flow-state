import { describe, expect, it } from "vite-plus/test";
import { endingOf, ReadEnding } from "./entry-view.ts";
import { CallResult } from "./input.ts";

// A read's ending keeps Flow's own Defect and Interrupted apart from a contract's failure tags, so
// a lookup whose error is tagged `Defect` or `Interrupted` is a failure of the contract's, never an
// issue of Flow's (Operations, Issue view (Entry); R11).

describe("a read's ending by its kind, not its reason's text (Operations, Issue view)", () => {
  it("Operations, Issue view (Entry): a contract's failure tagged Defect is a failure, not Flow's Defect", () => {
    const ending = endingOf(CallResult.Failure({ reason: "Defect", error: { _tag: "Defect" } }));

    expect(ReadEnding.$is("Defect")(ending)).toBe(false);
    expect(ReadEnding.$is("Failed")(ending)).toBe(true);
  });

  it("Operations, Issue view (Entry): a call that died is Flow's Defect, whatever reason a contract uses", () => {
    expect(ReadEnding.$is("Defect")(endingOf(CallResult.Defect()))).toBe(true);
    expect(ReadEnding.$is("Interrupted")(endingOf(CallResult.Interrupted()))).toBe(true);
  });
});
