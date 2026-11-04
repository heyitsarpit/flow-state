import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noAllocationInLoopRule } from "./no-allocation-in-loop.ts";

const tester = createRuleTester("no-allocation-in-loop");

tester.run("no-allocation-in-loop", noAllocationInLoopRule, {
	valid: [
		"const total = (xs: number[]) => { let sum = 0; for (const x of xs) sum += x; return sum; };",
		"const f = (xs: number[]) => { const seen = new Set<number>(); for (const x of xs) seen.add(x); return seen; };",
		"const f = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0);",
		"const f = (xs: number[]) => xs.map(double);",
		"for (let i = 0, out = []; i < 3; i++) { use(i); }",
		"const f = (xs: number[]) => { for (const x of xs) use(...xs); };",
		"const once = { a: 1 }; const f = () => [once];",
		{
			code: "const f = (xs: number[]) => { for (const x of xs) out.push({ x }); };",
			options: [{ sourceRoots: ["elsewhere"] }],
		},
	],
	invalid: [
		{
			code: "const f = (xs: number[]) => { for (const x of xs) out.push({ x }); };",
			errors: [{ messageId: "allocation" }],
		},
		{
			code: "const f = (xs: number[]) => { while (more()) { const parts = [a, b]; use(parts); } };",
			errors: [{ messageId: "allocation" }],
		},
		{
			code: "const f = (xs: number[]) => xs.map((x) => ({ x }));",
			errors: [{ messageId: "allocation" }],
		},
		{
			code: "const f = (xs: number[][]) => xs.reduce((all, x) => [...all, ...x], []);",
			errors: [{ messageId: "allocation" }, { messageId: "allocation" }, { messageId: "allocation" }],
		},
		{
			code: "const f = (xs: number[]) => { for (const x of xs) handlers.push(() => x); };",
			errors: [{ messageId: "allocation" }],
		},
		{
			code: "const f = (xs: string[]) => { for (const x of xs) seen.add(new Key(x)); };",
			errors: [{ messageId: "allocation" }],
		},
	],
});
