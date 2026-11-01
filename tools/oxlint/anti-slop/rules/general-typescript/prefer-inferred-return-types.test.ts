import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { preferInferredReturnTypesRule } from "./prefer-inferred-return-types.ts";

const tester = createRuleTester("prefer-inferred-return-types");
const returnTypeFilename = "/project/packages/flow-state-rewrite/src/example.ts";
tester.run("prefer-inferred-return-types", preferInferredReturnTypesRule, {
  valid: [
    { code: "const size = (text: string) => text.length;", filename: returnTypeFilename },
    { code: "type Read = () => string; interface Reader { read(): string; } declare function read(): string; abstract class Base { abstract read(): string; }", filename: returnTypeFilename },
    { code: "function size(): number; function size() { return 1; }", filename: returnTypeFilename },
    { code: "// RETURN_TYPE: Recursive inference requires an anchor.\nexport const depth = (n: number): number => n ? depth(n - 1) : 0;", filename: returnTypeFilename },
    { code: "// RETURN_TYPE: Exposes only the public view.\nexport default function read(): string { return 'value'; }", filename: returnTypeFilename },
    { code: "const reader = {\n// RETURN_TYPE: Preserves the readonly publication boundary.\nread(): readonly string[] { return []; }\n};", filename: returnTypeFilename },
    { code: "class Reader {\n// RETURN_TYPE: Defines the narrowing contract.\nread(value: unknown): value is string { return typeof value === 'string'; }\n}", filename: returnTypeFilename },
    { code: "class Reader {\n/* RETURN_TYPE: Preserves the public callback contract. */\nread = (): string => 'value';\n}", filename: returnTypeFilename },
    { code: "// RETURN_TYPE: Keeps the getter public type stable.\nfunction read(): string { return 'value'; }", filename: "C:\\project\\packages\\flow-state-rewrite\\src\\example.ts" },
    { code: "function read(): string { return 'value'; }", filename: "/project/packages/flow-state/src/example.ts" },
  ],
  invalid: [
    { code: "const value = (): number => 1;", filename: "/project/packages/flow-state-rewrite/test/static/medium.ts", errors: [{ messageId: "infer" }] },
    ...[
      "const size = (text: string): number => text.length;",
      "export function read(): string { return 'value'; }",
      "const read = function (): string { return 'value'; };",
      "const reader = { read(): string { return 'value'; } };",
      "class Reader { get value(): string { return 'value'; } }",
      "consume((): number => 1);",
      "const isText = (value: unknown): value is string => typeof value === 'string';",
      "function assertText(value: unknown): asserts value is string { if (typeof value !== 'string') throw Error(); }",
      "// RETURN_TYPE:\nconst read = (): string => 'value';",
      "// RETURN_TYPE:    \nconst read = (): string => 'value';",
      "// RETURN_TYPE: stale comment\n\nconst read = (): string => 'value';",
      "const previous = 1; // RETURN_TYPE: belongs to another statement\nconst read = (): string => 'value';",
      "// RETURN_TYPE: Outer signature has a required contract.\nconst outer = (): string => { const inner = (): string => 'value'; return inner(); };",
      "// RETURN_TYPE: Must not cover multiple declarations.\nconst a = (): string => 'a', b = () => 'b';",
    ].map((code) => ({ code, filename: returnTypeFilename, errors: [{ messageId: "infer" }] })),
  ],
});
