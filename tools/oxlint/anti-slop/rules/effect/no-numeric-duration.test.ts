import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noNumericDurationRule } from "./no-numeric-duration.ts";

const tester = createRuleTester("no-numeric-duration");

tester.run("no-numeric-duration", noNumericDurationRule, {
	valid: [
		'import { Duration, Effect, Schedule } from "effect"; Effect.sleep(Duration.seconds(1));',
		'import { Effect } from "effect"; Effect.timeout("5 seconds");',
		'import { Effect } from "effect"; Effect.timeoutOrElse({ duration: "5 seconds", orElse });',
		'import { Effect } from "effect"; Effect.cachedWithTTL(effect, "5 seconds");',
		'import { Schedule } from "effect"; Schedule.duration("5 seconds"); Schedule.upTo({ duration: "5 seconds" });',
		'import { Schedule } from "effect"; Schedule.recurs(3);',
		'import { Effect } from "effect"; const duration = 100; Effect.delay(duration);',
	],
	invalid: [
		{
			code: 'import { Effect } from "effect"; Effect.sleep(100);',
			errors: [{ messageId: "duration" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.timeout(effect, 100);',
			errors: [{ messageId: "duration" }],
		},
		{
			code: 'import { Schedule } from "effect"; Schedule.exponential(100);',
			errors: [{ messageId: "duration" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.timeoutOption(100); Effect.cachedWithTTL(effect, 100); Effect.cachedInvalidateWithTTL(100);',
			errors: [
				{ messageId: "duration" },
				{ messageId: "duration" },
				{ messageId: "duration" },
			],
		},
		{
			code: 'import { Effect } from "effect"; Effect.timeoutOrElse({ duration: 100, orElse }); Effect.timeoutOrElse(effect, { duration: 100, orElse });',
			errors: [{ messageId: "duration" }, { messageId: "duration" }],
		},
		{
			code: 'import { Schedule } from "effect"; Schedule.duration(100); Schedule.during(100); Schedule.fibonacci(100); Schedule.fixed(100); Schedule.spaced(100); Schedule.windowed(100);',
			errors: Array.from({ length: 6 }, () => ({ messageId: "duration" })),
		},
		{
			code: 'import { Schedule } from "effect"; Schedule.upTo({ duration: 100 }); Schedule.upTo(schedule, { ["duration"]: 100 });',
			errors: [{ messageId: "duration" }, { messageId: "duration" }],
		},
		{
			code: 'import { Effect } from "effect"; Effect.sleep(-100);',
			errors: [{ messageId: "duration" }],
		},
		{
			code: 'import * as Fx from "effect"; Fx.Effect.sleep(100); Fx.Schedule.fixed(100);',
			errors: [{ messageId: "duration" }, { messageId: "duration" }],
		},
	],
});
