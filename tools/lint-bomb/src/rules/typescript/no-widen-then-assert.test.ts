import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noWidenThenAssertRule } from "./no-widen-then-assert.ts";

const tester = createRuleTester("no-widen-then-assert");

tester.run("no-widen-then-assert-regression", noWidenThenAssertRule, {
	valid: [
		"const value = input as DomainValue;",
		"const precise: { id: string } = { id: \"x\" }; const value = precise as { id: string };",
		"const value = input as Record<string, string>;",
		"const erased: unknown = getInput(); const value = erased as DomainValue;",
		"let erased: unknown = { id: \"x\" }; const value = erased as DomainValue;",
		"const erased: unknown = { id: \"erased\" }; const value = erased as DomainValue;",
		"const erased: Record<string, unknown> = { id: \"x\" }; const value = erased as Record<string, string>;",
	],
	invalid: [
		{ code: "const erased: any = { id: \"x\" }; const value = erased as { id: string };", errors: [{ messageId: "widenThenAssert" }] },
		{ code: "const erased: object = { id: \"x\" }; const value = erased as { id: string };", errors: [{ messageId: "widenThenAssert" }] },
	],
});


tester.run("no-widen-then-assert-builtin-identity", noWidenThenAssertRule, {
  valid: [
    'type Record<K,V> = { id: string }; const wide: Record<string, any> = { id: "x" }; const value = wide as { id: string };',
    'import type { Record } from "./types.js"; const wide: Record<string, any> = { id: "x" }; const value = wide as { id: string };',
    'function read<Record>() { const wide = { id: "x" } as Record; const value = wide as { id: string }; }',
    'type Readonly<T> = { id: string }; const wide: Readonly<Record<string, any>> = { id: "x" }; const value = wide as { id: string };',
    'type PropertyKey = "id"; const wide: Record<PropertyKey, any> = { id: "x" }; const value = wide as { id: string };',
  ],
  invalid: [
    { code: 'const wide: Record<string, any> = { id: "x" }; const value = wide as { id: string };', errors: [{ messageId: "widenThenAssert" }] },
    { code: 'const wide: Readonly<Record<PropertyKey, any>> = { id: "x" }; const value = wide as { id: string };', errors: [{ messageId: "widenThenAssert" }] },
    { code: 'const wide: Record<string, any> = { id: "x" }; const value = wide as Record<string, string>;', errors: [{ messageId: "widenThenAssert" }] },
  ],
});


tester.run("no-widen-then-assert-type-value-namespaces", noWidenThenAssertRule, {
  valid: [
    'export {}; type Record<K,V> = { id: string }; function read() { const Record = 1; const wide: Record<string, any> = { id: "x" }; const value = wide as { id: string }; }',
    'export {}; class Record<K,V> { id = "x"; } const wide: Record<string, any> = { id: "x" }; const value = wide as { id: string };',
  ],
  invalid: [
    { code: 'export {}; const Record = 1; const wide: Record<string, any> = { id: "x" }; const value = wide as { id: string };', errors: [{ messageId: "widenThenAssert" }] },
    { code: 'export {}; const Readonly = 1; const wide: Readonly<Record<string, any>> = { id: "x" }; const value = wide as { id: string };', errors: [{ messageId: "widenThenAssert" }] },
    { code: 'export {}; const PropertyKey = 1; const wide: Record<PropertyKey, any> = { id: "x" }; const value = wide as { id: string };', errors: [{ messageId: "widenThenAssert" }] },
    { code: 'export {}; function read(Record: number) { const wide: Record<string, any> = { id: "x" }; const value = wide as { id: string }; }', errors: [{ messageId: "widenThenAssert" }] },
  ],
});
