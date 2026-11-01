import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noParallelDiagnosticErrorsRule } from "./no-parallel-diagnostic-errors.ts";

const tester = createRuleTester("no-parallel-diagnostic-errors");

tester.run("no-parallel-diagnostic-errors", noParallelDiagnosticErrorsRule, {
	valid: [
		{
			code: 'import { Schema } from "effect"; class Diagnostic extends Schema.TaggedError<Diagnostic>()("Diagnostic", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/diagnostic/diagnostic.ts",
		},
		{
			code: 'import { Schema } from "effect"; class Diagnostic extends Schema.TaggedError<Diagnostic>("flow-state/Diagnostic")("Diagnostic", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/diagnostic/diagnostic.ts",
		},
		{
			code: 'import { Schema } from "effect"; const S = Schema; class Diagnostic extends S.TaggedError<Diagnostic>()("Diagnostic", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/diagnostic/diagnostic.ts",
		},
		{ code: 'const Schema = { TaggedError: () => undefined }; Schema.TaggedError("local");', filename: "/project/packages/flow-state-rewrite/src/local.ts" },
		{ code: 'class LocalErrorBase {} class FeatureFailure extends LocalErrorBase {}', filename: "/project/packages/flow-state-rewrite/src/local.ts" },
		{
			code: 'import { Data } from "effect"; let D = Data; D.TaggedError("local");',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
		},
		{
			code: 'import { Data } from "effect"; let D = Data; D = unrelated; D.TaggedError("local");',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
		},
		{
			code: 'const D = { TaggedError: () => undefined }; const DD = D; const Tagged = DD.TaggedError; Tagged("local");',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
		},
		{
			code: 'const first = second; const second = first; first.TaggedError("local");',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
		},
	],
	invalid: [
		{
			code: 'import { Schema } from "effect"; class Diagnostic { readonly factory = Schema.TaggedError("NotADeclaration"); }',
			filename: "/project/packages/flow-state-rewrite/src/diagnostic/diagnostic.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Data, Schema } from "effect"; class A extends Data.TaggedError("A") {} class B extends Schema.TaggedError<B>()("B", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }, { messageId: "parallel" }],
		},
		{
			code: 'import { Data as D } from "effect"; class A extends D["TaggedError"]("A") {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Schema as S } from "effect"; class A extends S["TaggedError"]<A>()("A", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Schema } from "effect"; const S = Schema; class A extends (S)[`TaggedError`]<A>()("A", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Data } from "effect"; class A extends Data[`TaggedError`]("A") {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import * as Fx from "effect"; class A extends Fx.Data.TaggedError("A") {} class B extends Error {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }, { messageId: "parallel" }],
		},
		{
			code: 'import * as Fx from "effect"; class A extends Fx["Schema"]["TaggedError"]<A>()("A", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Data } from "effect"; const { TaggedError: makeError } = Data; class A extends makeError("A") {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Data } from "effect"; const D = Data; const DD = D; const Tagged = DD.TaggedError; class A extends Tagged("A") {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'import { Schema } from "effect"; const S = Schema; const SS = S; const Tagged = SS["TaggedError"]; class A extends Tagged<A>()("A", {}) {}',
			filename: "/project/packages/flow-state-rewrite/src/feature.ts",
			errors: [{ messageId: "parallel" }],
		},
		{
			code: 'class FeatureError extends Error {}',
			filename: "C:\\project\\packages\\flow-state-rewrite\\src\\feature.ts",
			errors: [{ messageId: "parallel" }],
		},
	],
});
