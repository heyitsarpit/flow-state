import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noEffectRefReadThenWriteRule } from "./no-effect-ref-read-then-write.ts";

const tester = createRuleTester("no-effect-ref-read-then-write");

tester.run("no-effect-ref-read-then-write", noEffectRefReadThenWriteRule, {
	valid: [
		'import { Ref } from "effect"; function update(state: Ref.Ref<number>) { Ref.get(state); const setStateAsValue = Ref.set(state); return setStateAsValue; }',
		'import { Ref } from "effect"; function update(state: Ref.Ref<number>, other: Ref.Ref<number>) { Ref.get(state); Ref.set(1)(other); }',
		'import { Ref } from "effect"; function update(state: Ref.Ref<number>, read: boolean) { if (read) { Ref.get(state); } else { Ref.set(state, 1); } }',
		'import { Ref } from "effect"; function update(state: Ref.Ref<number>, read: boolean) { return read ? Ref.get(state) : Ref.set(state, 1); }',
		'import { Ref } from "effect"; function update(state: Ref.Ref<number>, read: boolean) { return read ? Ref.get(state) : Ref.set(1)(state); }',

		'import { get } from "effect/Context"; function f(state: unknown) { get(state); }',
		'import * as Ref from "effect/Ref"; function update(state: Ref.Ref<number>, other: Ref.Ref<number>) { let alias = state; alias = other; Ref.get(state); Ref.set(alias, 1); }',
		'import * as Ref from "effect/Ref"; function update(first: Ref.Ref<number>, second: Ref.Ref<number>) { let state = first; const snapshot = state; state = second; Ref.get(snapshot); Ref.set(state, 1); }',
		'import * as Ref from "effect/Ref"; function update(first: Ref.Ref<number>, second: Ref.Ref<number>) { let state = first; const snapshot = state; state = second; Ref.get(state); Ref.set(snapshot, 1); }',
		'import { Ref } from "effect"; function update(state: Ref.Ref<number>) { return Ref.modify(state, (value) => [value + 1, value]); }',
		'import { Ref as R } from "effect"; function readOnly(state: R.Ref<number>) { return R.get(state); }',
		'import * as E from "effect"; function separate(first: E.Ref.Ref<number>, second: E.Ref.Ref<number>) { E.Ref.get(first); E.Ref.set(second, 1); }',
		'import * as E from "effect"; function separate(first: E.Ref.Ref<number>, second: E.Ref.Ref<number>) { E["Ref"].get(first); E["Ref"]["set"](second, 1); }',
		'import * as Ref from "effect/Ref"; function update(first: Ref.Ref<number>, second: Ref.Ref<number>) { let state = first; function later() { state = second; } Ref.get(state); Ref.set(second, 1); }',
		'import * as Ref from "effect/Ref"; function update(first: Ref.Ref<number>, second: Ref.Ref<number>, condition: boolean) { let state = first; if (condition) state = second; Ref.get(state); Ref.set(first, 1); }',
		'import { Ref } from "effect"; function firstWrites(state: Ref.Ref<number>) { Ref.set(state, 1); Ref.get(state); }',
		'import { Ref } from "effect"; function outer(state: Ref.Ref<number>) { Ref.get(state); return () => Ref.set(state, 1); }',
	],
	invalid: [
		{
			code: 'import { Effect, Ref } from "effect"; const update = (state: Ref.Ref<number>) => Effect.gen(function* () { const current = yield* Ref.get(state); yield* Ref.set(current + 1)(state); });',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import { get, set } from "effect/Ref"; function update(state: Ref<number>) { const alias = state; get(state); set(1)(alias); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import { Ref } from "effect"; function update(state: Ref.Ref<number>, read: boolean) { if (read) { Ref.get(state); } Ref.set(state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import { Ref } from "effect"; function update(state: Ref.Ref<number>, read: boolean) { Ref.get(state); if (read) { Ref.set(state, 1); } }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import { Ref } from "effect"; function update(state: Ref.Ref<number>, read: boolean) { if (read) { Ref.get(state); Ref.set(state, 1); } }',
			errors: [{ messageId: "readThenWrite" }],
		},

		{
			code: 'import { get as refGet, set as refSet } from "effect/Ref"; function update(state: Ref<number>) { refGet(state); refSet(state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import * as Ref from "effect/Ref"; const refGet = Ref.get; const refSet = Ref.set; function update(state: Ref.Ref<number>) { refGet(state); refSet(state, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
		{
			code: 'import * as Ref from "effect/Ref"; function update(state: Ref.Ref<number>) { const alias = state; Ref.get(state); Ref.set(alias, 1); }',
			errors: [{ messageId: "readThenWrite" }],
		},
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
