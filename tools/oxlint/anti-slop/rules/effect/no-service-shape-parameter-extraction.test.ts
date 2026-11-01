import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noServiceShapeParameterExtractionRule } from "./no-service-shape-parameter-extraction.ts";

const tester = createRuleTester("no-service-shape-parameter-extraction");

tester.run("no-service-shape-parameter-extraction", noServiceShapeParameterExtractionRule, {
	valid: [
		"type Value = Parameters<typeof fn>[0];",
		"type Value = Parameters<(typeof Service)[\"get\"]>[0];",
		'declare const Repository: { of(input: string): unknown }; type Value = Parameters<(typeof Repository)["of"]>[0];',
		'import { Context } from "effect"; class Service extends Context.Tag<Service>()("Service") {} type Value = Parameters<(typeof Service)["of"]>[0];',
		'import { Context } from "effect"; class Service extends Context.Service<Service>()("Service") {} type Value = Parameters<(typeof Service)["tag"]>[0];',
	],
	invalid: [
		{
			code: 'import { Context } from "effect"; class Service extends Context.Service<Service>()("Service") {} type Value = Parameters<(typeof Service)["of"]>[0];',
			errors: [{ messageId: "serviceShape" }],
		},
		{
			code: 'import { Context as C } from "effect"; class Service extends C["Service"]<Service>()("Service") {} type Value = Parameters<(typeof Service)["of"]>[0];',
			errors: [{ messageId: "serviceShape" }],
		},
		{
			code: 'import * as Fx from "effect"; class Service extends Fx.Context.Service<Service>()("Service") {} type Value = Parameters<(typeof Service)["of"]>[0];',
			errors: [{ messageId: "serviceShape" }],
		},
		{
			code: 'import { Context } from "effect"; class Service extends Context.Service<Service>()("Service") {} type Value = Parameters<((typeof Service)["of"])>[0];',
			errors: [{ messageId: "serviceShape" }],
		},
		{
			code: 'import * as Fx from "effect"; class Service extends Fx["Context"]["Service"]<Service>()("Service") {} type Value = Parameters<(typeof Service)["of"]>[0];',
			errors: [{ messageId: "serviceShape" }],
		},
	],
});
