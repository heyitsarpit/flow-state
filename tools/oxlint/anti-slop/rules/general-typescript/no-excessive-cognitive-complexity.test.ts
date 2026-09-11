import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noExcessiveCognitiveComplexityRule } from "./no-excessive-cognitive-complexity.ts";

const tester = createRuleTester("no-excessive-cognitive-complexity");

tester.run("no-excessive-cognitive-complexity", noExcessiveCognitiveComplexityRule, {
	valid: [
		"function simple(value) { if (value) return 1; return 0; }",
		"function nested(value, first, second) { if (value) { if (first) { if (second) return 1; } } return 0; }",
		{ code: "function atThreshold(value) { if (value) return 1; if (value) return 2; if (value) return 3; }", options: [{ threshold: 3, minimumBranches: 3 }] },
		{ code: "function belowMinimum(value) { if (value) { if (value) return 1; } return 0; }", options: [{ threshold: 2, minimumBranches: 3 }] },
		"function smallSwitch(value) { switch (value) { case 1: return 1; case 2: return 2; default: return 0; } }",
	],
	invalid: [
		{
			code: "function manyBranches(value) { if (value) return 1; if (value) return 2; if (value) return 3; if (value) return 4; if (value) return 5; if (value) return 6; if (value) return 7; if (value) return 8; if (value) return 9; if (value) return 10; if (value) return 11; if (value) return 12; if (value) return 13; if (value) return 14; if (value) return 15; if (value) return 16; return 0; }",
			errors: [{ messageId: "complexity" }],
		},
		{
			code: "function deep(value) { if (value) { if (value) { if (value) { if (value) { if (value) { if (value) return 1; } } } } } return 0; }",
			errors: [{ messageId: "complexity" }],
		},
		{
			code: "const choose = (value) => value ? (value ? (value ? (value ? (value ? (value ? 1 : 2) : 3) : 4) : 5) : 6) : 7;",
			errors: [{ messageId: "complexity" }],
		},
		{
			code: "function over(value) { if (value) return 1; if (value) return 2; if (value) return 3; if (value) return 4; if (value) return 5; if (value) return 6; if (value) return 7; if (value) return 8; if (value) return 9; if (value) return 10; if (value) return 11; if (value) return 12; if (value) return 13; if (value) return 14; if (value) return 15; if (value) return 16; if (value) return 17; return 0; }",
			errors: [{ messageId: "complexity" }],
		},
		{
			code: "function logical(a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q) { return a && b && c && d && e && f && g && h && i && j && k && l && m && n && o && p && q; }",
			errors: [{ messageId: "complexity" }],
		},
		{
			code: "function configured(value) { if (value) return 1; if (value) return 2; if (value) return 3; }",
			options: [{ threshold: 2, minimumBranches: 3 }],
			errors: [{ messageId: "complexity" }],
		},
	],
});
