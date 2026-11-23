import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noShallowJsonDomainCastRule } from "./no-shallow-json-domain-cast.ts";

const tester = createRuleTester("no-shallow-json-domain-cast");

tester.run("no-shallow-json-domain-cast", noShallowJsonDomainCastRule, {
  valid: [
    'function read(JSON: { parse(source: string): DomainValue }) { const { "parse": parse } = JSON; return parse(source) as DomainValue; }',
    'const { "parse": parse } = custom; const value = parse(source) as DomainValue;',

    {
      code: "const decode = (source: string) => JSON.parse(source);",
      filename: "/project/src/adapters/json.ts",
      options: [{ allowedDirectories: ["/project/src/adapters"] }],
    },
    "const decode = (JSON: { parse(source: string): DomainValue }) => JSON.parse(source);",

    "function read(JSON: { parse(source: string): DomainValue }) { return JSON.parse(source); }",
    "const JSON = { parse: (source: string): DomainValue => ({ source }) }; const value = JSON.parse(input);",
    "function read(JSON: { parse(source: string): DomainValue }) { const parse = JSON.parse; return parse(source) as DomainValue; }",
    "let parse = JSON.parse; parse = customParse; const value = parse(source) as DomainValue;",
    {
      code: "const raw: unknown = JSON.parse(source);",
      options: [
        { allowedFiles: ["/project/packages/flow-state/src/runtime/runtime-boot-decoder.ts"] },
      ],
      filename: "/project/packages/flow-state/src/runtime/runtime-boot-decoder.ts",
    },
    {
      code: "const raw = JSON.parse(source);",
      options: [
        { allowedFiles: ["/project/packages/flow-state/src/core/inspection/trace-artifact.ts"] },
      ],
      filename: "/project/packages/flow-state/src/core/inspection/trace-artifact.ts",
    },
    {
      code: "const value = JSON.parse(source);",
      filename: "/project/src/runtime/runtime-boot-decoder.ts",
      options: [{ allowedDirectories: ["/project/src/runtime"] }],
    },
    { code: "const value = JSON.parse(source);", filename: "/project/src/value.test.ts" },
    { code: "const value = JSON.parse(source);", filename: "/project/src/value.test.mts" },
    { code: "const value = JSON.parse(source);", filename: "/project/data/value.json" },
  ],
  invalid: [
    {
      code: 'const { "parse": parse } = JSON; const value = parse(source) as DomainValue;',
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: 'const { ["parse"]: parse } = JSON; const value = parse(source) as DomainValue;',
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: "const decode = (source: string) => JSON.parse(source);",
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: "const parse = JSON.parse; const decode = (source: string) => parse(source);",
      errors: [{ messageId: "jsonParse" }],
    },

    {
      code: "const value = JSON.parse(source) as DomainValue;",
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: "const parse = JSON.parse; const value = parse(source) as DomainValue;",
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: 'const parse = JSON["parse"]; const value = parse(source) as DomainValue;',
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: "const { parse } = JSON; const value = parse(source) as DomainValue;",
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: "const { parse: decode } = JSON; const value = decode(source) as DomainValue;",
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: "let value: DomainValue; value = JSON.parse(source);",
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: "function read() { return JSON.parse(source); }",
      errors: [{ messageId: "jsonParse" }],
    },
    { code: "const raw: unknown = JSON.parse(source);", errors: [{ messageId: "jsonParse" }] },
    {
      code: "function decode() { return JSON.parse(source) as DomainValue; }",
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: "const value = JSON.parse(source) as DomainValue;",
      filename: "/project/src/value.mts",
      errors: [{ messageId: "jsonParse" }],
    },
    {
      code: "const value = JSON.parse(source) as DomainValue;",
      filename: "/project/src/value.cts",
      errors: [{ messageId: "jsonParse" }],
    },
  ],
});

tester.run("no-shallow-json-domain-cast-portable-default", noShallowJsonDomainCastRule, {
  valid: [],
  invalid: [
    {
      code: "const value = JSON.parse(input);",
      filename: "/application/src/runtime/runtime-boot-decoder.ts",
      errors: [{ messageId: "jsonParse" }],
    },
  ],
});
