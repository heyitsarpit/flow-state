import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noInlineImportTypeQueryRule } from "./no-inline-import-type-query.ts";

const tester = createRuleTester("no-inline-import-type-query");

tester.run("no-inline-import-type-query", noInlineImportTypeQueryRule, {
	valid: [
		'import type { FlowResourceSnapshot } from "../api/types.js"; type Snapshot = FlowResourceSnapshot;',
		{
			code: 'type Snapshot = import("../api/types.js").FlowResourceSnapshot;',
			filename: "/project/types.d.ts",
		},
		{
			code: 'type Snapshot = import("../api/types.js").FlowResourceSnapshot;',
			filename: "/project/src/generated/api.ts",
		},
		{
			code: 'type Snapshot = import("../api/types.js").FlowResourceSnapshot;',
			filename: "/project/src/api.generated.ts",
		},
		{
			code: 'type Snapshot = import("../api/types.js").FlowResourceSnapshot;',
			filename: "/project/src/api.gen.ts",
		},
	],
	invalid: [
		{
			code: 'type Snapshot = import("../api/types.js").FlowResourceSnapshot;',
			filename: "/project/src/domain.ts",
			errors: [{ messageId: "inlineImportType" }],
		},
		{ code: 'type Value = import("./value.js").Value;', filename: "/project/src/domain/value.ts", errors: [{ messageId: "inlineImportType" }] },
		{ code: 'interface Value { payload: import("./value.js").Payload; }', filename: "/project/src/domain/value.ts", errors: [{ messageId: "inlineImportType" }] },
		{ code: 'type Value = Array<import("./value.js").Item>;', filename: "/project/src/domain/value.ts", errors: [{ messageId: "inlineImportType" }] },
		{ code: 'function read(): import("./value.js").Value { return value; }', filename: "/project/src/domain/value.ts", errors: [{ messageId: "inlineImportType" }] },
	],
});
