import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { useImportTypeRule } from "./use-import-type.ts";

const tester = createRuleTester("use-import-type");

tester.run("use-import-type", useImportTypeRule, {
	valid: [
		'import type { Value } from "./types.js"; type Result = Value;',
		'import { value } from "./values.js"; void value;',
		'import { Value, value } from "./mixed.js"; type Result = Value; void value;',
		'import { Value } from "./types.js";',
		'import { value } from "./values.js"; type Result = typeof value;',
	],
	invalid: [
		{
			code: 'import { Value } from "./types.js"; type Result = Value;',
			errors: [{ messageId: "importType" }],
		},
		{ code: 'import DefaultValue from "./types.js"; type Result = DefaultValue;', errors: [{ messageId: "importType" }] },
		{ code: 'import * as Types from "./types.js"; type Result = Types.Value;', errors: [{ messageId: "importType" }] },
		{ code: 'import { Value as Domain } from "./types.js"; type Result = Domain;', errors: [{ messageId: "importType" }] },
		{ code: 'import { type Value } from "./types.js"; type Result = Value;', errors: [{ messageId: "importType" }] },
	],
});
