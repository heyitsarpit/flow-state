import { createRuleTester } from "../../shared/test/rule-tester.ts";
import { noPublicRuntimeInfrastructureRule } from "./no-public-runtime-infrastructure.ts";

const tester = createRuleTester("no-public-runtime-infrastructure");

tester.run("no-public-runtime-infrastructure", noPublicRuntimeInfrastructureRule, {
	valid: [
		'import { Queue } from "effect"; interface PrivateEngine { mailbox: Queue.Queue<string>; }',
		'import { Effect } from "effect"; export interface Handle { send: (value: string) => Effect.Effect<void>; }',
		'type Queue<T> = { take: () => T }; export interface Domain { queue: Queue<string>; }',
		{ code: 'import { Queue } from "effect"; export interface InternalEngine { mailbox: Queue.Queue<string>; }', filename: "/project/packages/flow-state-rewrite/src/runtime/actor-engine.ts", options: [{ sourceRoots: ["packages/flow-state-rewrite/src/public"] }] },
		{ code: 'import { Queue } from "effect"; export interface Adapter { queue: Queue.Queue<string>; }', filename: "/project/packages/flow-state-rewrite/src/public/adapter/queue.ts", options: [{ sourceRoots: ["packages/flow-state-rewrite/src/public"], allowedPathFragments: ["/src/public/adapter/"] }] },
		{ code: 'import { Queue } from "effect"; export interface Host { queue: Queue.Queue<string>; }', filename: "/project/packages/flow-state-rewrite/src/public/host/queue.ts", options: [{ sourceRoots: ["packages/flow-state-rewrite/src/public"], allowedPathFragments: ["/src/public/host/"] }] },
	],
	invalid: [
		{
			code: 'import { Queue, Effect } from "effect"; export interface Engine { mailbox: Queue.Queue<string>; consumer: Effect.Effect<void>; }',
			errors: [{ messageId: "infrastructure" }, { messageId: "infrastructure" }],
		},
		{
			code: 'import { Scope } from "effect"; export type Input = { scope: Scope.Scope };',
			errors: [{ messageId: "infrastructure" }],
		},
		{
			code: 'import { Queue } from "effect"; export interface PublicEngine { mailbox: Queue.Queue<string>; }',
			filename: "/project/packages/flow-state-rewrite/src/public/root.ts",
			options: [{ sourceRoots: ["packages/flow-state-rewrite/src/public"] }],
			errors: [{ messageId: "infrastructure" }],
		},
		{
			code: 'import { Scope } from "effect"; export interface PublicHandle { scope: Scope.Scope; }',
			filename: "/project/packages/flow-state-rewrite/src/public/handle.ts",
			options: [{ sourceRoots: ["packages/flow-state-rewrite/src/public"] }],
			errors: [{ messageId: "infrastructure" }],
		},
		{
			code: 'import { Stream } from "effect"; export type PublicHandle = { stream: Stream.Stream<string>; };',
			filename: "/project/packages/flow-state-rewrite/src/public/stream.ts",
			options: [{ sourceRoots: ["packages/flow-state-rewrite/src/public"] }],
			errors: [{ messageId: "infrastructure" }],
		},
	],
});
