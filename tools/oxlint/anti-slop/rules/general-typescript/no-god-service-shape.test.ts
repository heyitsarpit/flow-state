import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noGodServiceShapeRule } from "./no-god-service-shape.ts";

const tester = createRuleTester("no-god-service-shape");

tester.run("no-god-service-shape", noGodServiceShapeRule, {
	valid: [
		{ code: "interface SmallService { one(): void; two(): void; }", filename: "/project/packages/demo/src/service.ts" },
		{ code: "interface Service { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; }", filename: "/project/packages/demo/src/service.ts" },
		{ code: "interface LargeValue { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }", filename: "/project/packages/demo/src/value.ts" },
		{ code: "interface Service { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }", filename: "/project/packages/demo/src/service.test.ts" },
		{ code: "declare interface Service { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }", filename: "/project/packages/demo/src/service.ts" },
	],
	invalid: [
		{
			code: "interface LargeService { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }",
			filename: "/project/packages/demo/src/service.ts",
			errors: [{ messageId: "godServiceShape" }],
		},
		{
			code: "interface DerivedService extends BaseService { three(): void; } interface BaseService { one(): void; two(): void; }",
			filename: "/project/packages/demo/src/service.ts",
			options: [{ threshold: 2 }],
			errors: [{ messageId: "godServiceShape" }],
		},
		{
			code: "type WrappedService = Readonly<{ one(): void; two(): void; three(): void; }>;",
			filename: "/project/packages/demo/src/service.ts",
			options: [{ threshold: 2 }],
			errors: [{ messageId: "godServiceShape" }],
		},
		{
			code: "interface Repository { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; }",
			filename: "/project/packages/demo/src/repository.ts",
			errors: [{ messageId: "godServiceShape" }],
		},
		{
			code: "type Client = { one(): void; two(): void; three(): void; four(): void; five(): void; six(): void; seven(): void; eight(): void; nine(): void; ten(): void; eleven(): void; twelve(): void; thirteen(): void; fourteen(): void; fifteen(): void; sixteen(): void; seventeen(): void; };",
			filename: "/project/packages/demo/src/client.ts",
			options: [{ threshold: 16 }],
			errors: [{ messageId: "godServiceShape" }],
		},
	],
});
