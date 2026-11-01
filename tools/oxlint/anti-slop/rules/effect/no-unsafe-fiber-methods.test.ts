import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noUnsafeFiberMethodsRule } from "./no-unsafe-fiber-methods.ts";

const tester = createRuleTester("no-unsafe-fiber-methods");

tester.run("no-unsafe-fiber-methods", noUnsafeFiberMethodsRule, {
	valid: [
		"const worker = { pollUnsafe() {} }; worker.pollUnsafe();",
		"interface LocalFiber { pollUnsafe(): void } declare const fiber: LocalFiber; fiber.pollUnsafe();",
		{
			code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.interruptUnsafe();',
			filename: "/project/packages/flow-state/src/runtime/host.ts",
		},
		{
			code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.pollUnsafe();',
			filename: "/project/packages/flow-state/src/server.ts",
		},
		{
			code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.pollUnsafe();',
			filename: "/project/packages/flow-state/src/core/orchestrator/orchestrator-system.ts",
		},
	],
	invalid: [
		{
			code: 'import { Fiber } from "effect"; declare const fiber: Fiber.Fiber<number, never>; fiber.pollUnsafe();',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "unsafeFiberMethod" }],
		},
		{
			code: 'import { Fiber } from "effect"; interface Holder { fiber: Fiber.Fiber<number, never> } declare const holder: Holder; holder.fiber["pollUnsafe"]();',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "unsafeFiberMethod" }],
		},
		{
			code: 'import * as Fx from "effect"; declare const fiber: Fx.Fiber.Fiber<number, never>; fiber.pollUnsafe();',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "unsafeFiberMethod" }],
		},
		{
			code: 'import * as Fx from "effect"; type WorkerFiber = Fx.Fiber.Fiber<number, never>; declare const fiber: WorkerFiber; fiber["interruptUnsafe"]();',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "unsafeFiberMethod" }],
		},
		{
			code: 'import { Fiber } from "effect"; interface Base { fiber: Fiber.Fiber<number, never> } interface Holder extends Base {} declare const holder: Holder; holder.fiber.pollUnsafe();',
			filename: "/project/packages/flow-state/src/core/domain.ts",
			errors: [{ messageId: "unsafeFiberMethod" }],
		},
	],
});
