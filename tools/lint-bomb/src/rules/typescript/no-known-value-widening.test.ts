import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noKnownValueWideningRule } from "./no-known-value-widening.ts";

const tester = createRuleTester("no-known-value-widening");

tester.run("no-known-value-widening-regression", noKnownValueWideningRule, {
	valid: [
		"const labels: Record<\"save\" | \"cancel\", string> = { save: \"Save\", cancel: \"Cancel\" };",
		"type Keys = \"save\" | \"cancel\"; const labels: Record<Keys, string> = { save: \"Save\", cancel: \"Cancel\" };",
		"type Labels = Record<\"save\", string>; const labels: Labels = { save: \"Save\" };",
		"type Bag<K extends PropertyKey, V> = Record<K, V>; const labels: Bag<\"save\", string> = { save: \"Save\" };",
		"type Bag<K extends PropertyKey, V> = Readonly<Record<K, V>>; const labels: Bag<\"save\", string> = { save: \"Save\" };",
		"type Identity<T> = T; const labels: Record<Identity<\"save\">, string> = { save: \"Save\" };",
		"type Bag<K extends PropertyKey = \"save\"> = Record<K, string>; const labels: Bag = { save: \"Save\" };",
		"type Labels = { save: string }; const labels: Labels = { save: \"Save\" };",
		"const labels: { save: string } = { save: \"Save\" };",
		"const labels: { save: \"Save\" } = { save: \"Save\" };",
		"const labels: { save: string; nested: { enabled: boolean } } = { save: \"Save\", nested: { enabled: true } };",
		"function labels(): { save: string } { return { save: \"Save\" }; }",
		"const labels = (): { save: string } => ({ save: \"Save\" });",
		"class Labels { value: { save: string } = { save: \"Save\" }; }",
		"const labels = { save: \"Save\" } as { save: string };",
		"const labels = { save: \"Save\" } satisfies Record<string, string>;",
		"const labels: Record<string, string> = {};",
		"const value = { id: 1 } as unknown;",
		"type A = B; type B = A; const labels: Record<A, string> = { save: \"Save\" };",
		"type Loop<T> = Loop<T>; const labels: Record<Loop<string>, string> = { save: \"Save\" };",
		"import type { Record } from \"domain\"; const labels: Record<string, string> = { save: \"Save\" };",
		"const labels: { [K in \"save\" | \"cancel\"]: string } = { save: \"Save\", cancel: \"Cancel\" };",
		"const value = { id: 1 };",
		"const value: unknown = input;",
		"const value: unknown = {};",
		"const value: unknown = {} as unknown;",
		"const value: object = input;",
		"const value: Record<string, unknown> = {};",
		"const value: Record<string, unknown> = { id: 1 };",
		"const value: string = \"known\";",
	],
	invalid: [
		{ code: "const labels: Record<string, string> = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "const labels: Record<string | 0, string> = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "const labels: Record<\"save\" | number, string> = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "const labels: Record<PropertyKey, string> = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "type Keys = string; const labels: Record<Keys, string> = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "type Identity<T> = T; const labels: Record<Identity<string>, string> = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "type Bag<K extends PropertyKey, V> = Record<K, V>; const labels: Bag<string, string> = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "type Bag<K extends PropertyKey, V> = Readonly<Record<K, V>>; const labels: Bag<string, string> = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "const labels: { save: string | number } = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "type Keys = \"save\" | string; type Bag = { [K in Keys]: string }; const labels: Bag = { save: \"Save\" };", errors: [{ messageId: "widening" }] },
		{ code: "const value: object = { id: 1 };", errors: [{ messageId: "widening" }] },
		{
			code: "function make() { type Bag = Record<string, string>; const value: Bag = { key: \"value\" }; return value; }",
			errors: [{ messageId: "widening" }],
		},
	],
});

tester.run("no-known-value-widening-round3", noKnownValueWideningRule, {
  "valid": [
    "const labels: { save: string } = { [\"save\"]: \"Save\" };",
    "const labels: { [\"save\"]: string } = { save: \"Save\" };",
    "const labels: { 1: string } = { [1]: \"Save\" };"
  ],
  "invalid": [
    {
      "code": "const labels: { save: string | number } = { [\"save\"]: \"Save\" };",
      "errors": [
        {
          "messageId": "widening"
        }
      ]
    }
  ]
});

tester.run("no-known-value-widening-report-cardinality", noKnownValueWideningRule, {
  valid: ['const labels = { save: "Save" };'],
  invalid: [
    { code: 'const labels: Record<string, string> = { save: "Save" };', errors: [{ messageId: "widening" }] },
    {
      code: 'const first: Record<string, string> = { save: "Save" }; const second: Record<string, string> = { save: "Save" };',
      errors: [{ messageId: "widening" }, { messageId: "widening" }],
    },
  ],
});
