import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEffectRefReadThenWriteRule } from "./no-effect-ref-read-then-write.ts";

const tester = createRuleTester("no-effect-ref-read-then-write");

tester.run("no-effect-ref-read-then-write", noEffectRefReadThenWriteRule, {
	valid: [
		'import { Ref } from "effect"; function update(state: Ref.Ref<number>) { return Ref.modify(state, (value) => [value + 1, value]); }',
		'import { Ref as R } from "effect"; function readOnly(state: R.Ref<number>) { return R.get(state); }',
		'import * as E from "effect"; function separate(first: E.Ref.Ref<number>, second: E.Ref.Ref<number>) { E.Ref.get(first); E.Ref.set(second, 1); }',
		'import * as E from "effect"; function separate(first: E.Ref.Ref<number>, second: E.Ref.Ref<number>) { E["Ref"].get(first); E["Ref"]["set"](second, 1); }',
		'import { Ref } from "effect"; function firstWrites(state: Ref.Ref<number>) { Ref.set(state, 1); Ref.get(state); }',
		'import { Ref } from "effect"; function outer(state: Ref.Ref<number>) { Ref.get(state); return () => Ref.set(state, 1); }',
	],
	invalid: [
		{
			code: 'import { Ref } from "effect"; function update(state: Ref.Ref<number>) { const current = Ref.get(state); return Ref.set(state, current + 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import { Ref as R } from "effect"; function update(state: R.Ref<number>) { R.get(state); R.set(state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import * as E from "effect"; function update(state: E.Ref.Ref<number>) { E.Ref.get(state); E.Ref.set(state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import * as E from "effect"; function update(state: E.Ref.Ref<number>) { E["Ref"]["get"](state); E.Ref["set"](state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import { Ref as R } from "effect"; function update(state: R.Ref<number>) { R.get(state); R["set"](state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
	],
});
