// Planted violations for no-hand-option, run through oxlint with the options vite.config.ts gives it.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/no-hand-option.test.ts
import { plantRules } from "./test-support.ts";

plantRules({
  "no-hand-option": {
    fires: [
      'const a = found._tag === "Some";',
      'const b = found._tag !== "None";',
      'const c = "Some" === found._tag;',
      'const d = found["_tag"] == "None";',
      'const e = { _tag: "Some", value: 1 };',
      'const f = { "_tag": "None" };',
      'expect(decode(x)._tag).toBe("None");',
      'expect(found._tag).toEqual("Some");',
      'expect(rows).toEqual([expect.objectContaining({ _tag: "Some", value: key })]);',
    ],
    quiet: [
      "const g = Option.isSome(found);",
      "const h = Option.some(1);",
      'const i = found._tag === "Ended";',
      'const j = { _tag: "Ended" };',
      'const k = found.kind === "Some";',
      'const l = { kind: "None" };',
      'expect(found._tag).toBe("Ended");',
      'expect(Option.isNone(found)).toBe(true);',
      'const m = { [tag]: "Some" };',
    ],
    silent: ["bench/planted.ts"],
  },
});

console.log("flow-state no-hand-option tests passed");
