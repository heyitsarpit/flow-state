import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noOptionalDomainPropertiesRule } from "./no-optional-domain-properties.ts";

const tester = createRuleTester("no-optional-domain-properties");

tester.run("no-optional-domain-properties", noOptionalDomainPropertiesRule, {
	valid: [
		{ code: "interface Value { value?: string; }", filename: "/project/packages/other/src/value.ts", options: [{ sourceRoots: ["/project/src/domain"] }] },
		{ code: "interface Value { value: Option<string>; }", filename: "/project/packages/flow-state/src/core/api/value.ts" },
		{ code: "class Value { value: Option<string>; }", filename: "/project/packages/flow-state/src/vnext/value.ts" },
		{ code: "const value = { optional: undefined };", filename: "/project/packages/flow-state/src/core/api/value.ts" },
		{
			code: "interface Value { value?: string; }",
			filename: "/project/packages/custom/src/value.ts",
			options: [{ sourceRoots: ["/project/packages/other/src"] }],
		},
		{
			code: "type Identity<T> = T; interface Value<T> { value: Identity<T>; }",
			filename: "/project/packages/flow-state-rewrite/src/runtime/value.ts",
		},
		{
			code: "type Maybe<T> = T | undefined; namespace Wire { export type Maybe<T> = T; } interface Value { value: Wire.Maybe<string>; }",
			filename: "/project/packages/flow-state-rewrite/src/runtime/value.ts",
		},
	],
	invalid: [
		{
			code: "interface Value { value?: string; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "interface Value { value: string | undefined; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "class Value { value: string | null; }",
			filename: "/project/packages/flow-state-rewrite/src/public/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "type Maybe<T> = T | undefined; interface Value { value: Maybe<string>; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
		{
			code: "interface Value { pair: [string, undefined]; }",
			filename: "/project/packages/flow-state/src/core/api/value.ts",
			errors: [{ messageId: "domainProperty" }],
		},
	],
});

tester.run("no-optional-domain-properties-portable-default", noOptionalDomainPropertiesRule, {
 valid: [],
 invalid: [{ code: "interface Value { value?: string; }", filename: "/application/src/runtime/service.ts", errors: [{ messageId: "domainProperty" }] }],
});

tester.run("no-optional-domain-properties-round3", noOptionalDomainPropertiesRule, {
  "valid": [
    "type Maybe = string | undefined; interface Box<Maybe> { value: Maybe; }",
    "type Maybe = string | undefined; function build() { type Maybe = string; type Box = { value: Maybe }; }",
    "type Identity<T> = T; type Wrap<T> = Identity<T>; interface Box { value: Wrap<string>; }",
    "type Loop<T> = Loop<T>; interface Box { value: Loop<string>; }"
  ],
  "invalid": [
    {
      "code": "function build() { type Maybe = string | undefined; type Box = { value: Maybe }; }",
      "errors": [
        {
          "messageId": "domainProperty"
        }
      ]
    },
    {
      "code": "type Identity<T> = T; type Wrap<T> = Identity<T>; interface Box { value: Wrap<undefined>; }",
      "errors": [
        {
          "messageId": "domainProperty"
        }
      ]
    }
  ]
});


tester.run("no-optional-domain-properties-dependent-defaults", noOptionalDomainPropertiesRule, {
  valid: [
    "type Alias<T, U=T> = U; interface Box { value: Alias<string>; }",
    "type Alias<T, U=T> = U; interface Box { value: Alias<undefined, string>; }",
    "type T = string; type Inner<U=T> = U; type Outer<T> = Inner; interface Box { value: Outer<undefined>; }",
  ],
  invalid: [
    { code: "type Alias<T, U=T> = U; interface Box { value: Alias<undefined>; }", errors: [{ messageId: "domainProperty" }] },
    { code: "type Alias<T, U=T, V=U> = V; interface Box { value: Alias<undefined>; }", errors: [{ messageId: "domainProperty" }] },
    { code: "type Alias<T, U=T> = U; type Outer<T> = Alias<T>; interface Box { value: Outer<undefined>; }", errors: [{ messageId: "domainProperty" }] },
  ],
});
