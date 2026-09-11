// anti-slop-fixture: text-only
/**
 * Accepted anti-slop examples.
 *
 * This file is an intentionally raw teaching corpus, not a compilable
 * production module. The RuleTester valid cases are the executable rule proof;
 * this file keeps the preferred forms visible beside the individual rule
 * tests. The fixture sweep loads it as source text and verifies the marker.
 */

import {
	Context,
	Data,
	Deferred,
	Duration,
	Effect,
	Exit,
	Fiber,
	Layer,
	Option,
	Ref,
	Result,
	Schedule,
	Schema,
	Scope,
} from "effect";

class DataValue extends Data.Class<{ id: string }> {}
type DataState = Data.TaggedEnum<{
	Loading: { startedAt: number };
	Ready: { value: string };
}>;

type AccountId = string & { AccountId: unique symbol };
type Account = { id: AccountId };
type AccountNotFound = { _tag: "AccountNotFound"; accountId: AccountId };
function accountNotFound(accountId: AccountId) {
	return Effect.fail({ _tag: "AccountNotFound", accountId } satisfies AccountNotFound);
}
type AccountEffect = ReturnType<typeof accountNotFound>;
type ResourceId = string & { ResourceId: unique symbol };
type Resource = { id: ResourceId };
type DomainItem = { id: string };
type DomainValue = { id: string };
type Snapshot = { id: string };
type App = { start: () => void };
type Value = { id: string };

type ParsedValue = { id: string };
type IsUnknown<T> = unknown extends T ? true : false;
type Status = "ready" | "blocked";
type GenericValue<T = string> = T;
type AppOptions = { id: string };
type MaybeDomainValue = Option.Option<DomainValue>;

const publicValue = "owned export";
export { publicValue };

declare const raw: string;
declare const input: DomainValue;
declare const iterable: Iterable<DomainItem>;
declare const first: boolean;
declare const second: boolean;
declare const inventory: { id: string };
declare const items: DomainItem[];
const processItem = (item: DomainItem) =>
	Effect.try({
		try: () => item.id,
		catch: (error) => error,
	});
declare const client: {
	fetchAccount: (
		id: AccountId,
		options: { signal: AbortSignal },
	) => Promise<Account>;
};
declare const id: AccountId;
declare const resource: Resource;
declare const callback: (value: DomainItem) => string;
declare const test: (name: string, body: () => void) => void;
type Expect = {
	(value: boolean): { toBe: (expected: boolean) => void; toEqual: (expected: boolean) => void };
	assertions: (count: number) => void;
	hasAssertions: () => void;
};
declare const expect: Expect;
declare const condition: boolean;
declare const runtime: { dispose: () => Promise<void> };
declare const release: (scope: Scope.Closeable, exit: Exit.Exit<void, Error>) => Effect.Effect<void>;
declare const record: { key: string };
declare const foreignCall: () => string;
declare const cause: Error;
declare const fiber: Fiber.Fiber<void, never>;
declare const maybeDomainValue: MaybeDomainValue;
declare const domainResult: Result.Result<DomainValue, Error>;

const inlineSnapshot: Snapshot = { id: "snapshot" };
const projected = Array.from(iterable, callback);

const conditionalItems: DomainItem[] = [];
if (first) conditionalItems.push({ id: "first" });
if (second) conditionalItems.push({ id: "second" });

const projectedObject = { id: input.id };
const summary = inventory.id;
const constructed = { kind: "module" as const, ...inventory, summary };

const decoded = Schema.decodeUnknownSync(
	Schema.Struct({ id: Schema.String }),
)(raw);

const resources = {
	[resource.id]: resource,
	} satisfies Record<ResourceId, Resource>;
const values: Value[] = [{ id: "value" }];
const stableInventory: typeof inventory = { ...inventory };

const options = {} satisfies { input?: string };
const namedResult: DomainValue = { id: decoded.id };
const namedAlias: DomainValue = namedResult;

function parseDomainValue(value: unknown): DomainValue {
	return Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(value);
}

function createApp(): App {
	return { start: () => undefined };
}

const app = createApp();
const maybeApp: App | undefined = app;

function acceptsOptions(value: AppOptions): void {
	void value;
}

function project(value: DomainItem): string {
	return value.id;
}

function findDomainValue(id: string): MaybeDomainValue {
	void id;
	return maybeDomainValue;
}

function validateDomainValue(value: DomainValue): Result.Result<DomainValue, Error> {
	return domainResult;
}

const dynamicValue = record.key;
const callbackValue = callback(items[0]);
const projectedItems = items.flatMap((item) => item.id.length > 0 ? [item.id] : []);
const reducedIds = items.reduce<string[]>((accumulator, item) => {
	accumulator.push(item.id);
	return accumulator;
}, []);
const selectedOption = Option.some(input.id);
const selectedOptionValue = Option.match(selectedOption, {
	onNone: () => "none",
	onSome: (value) => value,
});

const parsedValue: ParsedValue = { id: "parsed" };
const inferredGeneric: GenericValue = "value";
const explicitGeneric: GenericValue<number> = 1;

function label(status: Status): string {
	switch (status) {
		case "ready":
			return "ready";
		case "blocked":
			return "blocked";
	}
}

function branch(value: boolean): string {
	if (value) return "yes";
	return "no";
}

interface AccountRepositoryContract {
	findById: (accountId: AccountId) => AccountEffect;
}

class AccountRepository extends Context.Service<AccountRepository, AccountRepositoryContract>()(
	"AccountRepository",
) {}

// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: external client exposes only Promise and accepts an AbortSignal.
const loadAccount = Effect.tryPromise({
	try: (signal) => client.fetchAccount(id, { signal }),
	catch: String,
});

const normalized = input.id.trim();
const explicitSchedule = Schedule.exponential(Duration.millis(100));
const explicitSleep = Duration.seconds(1);

const inertEffectFactory = (value: DomainValue) =>
	Effect.suspend(() => Effect.succeed(value.id));
const deferredMutation = Effect.sync(() => input.id);
const constantProjection = Effect.succeed(input).pipe(Effect.as(false));
const emptyContext = Context.empty();
const concreteResourceConfig = {
	staleTime: Schema.DurationFromMillis,
	gcTime: Schema.Number,
};
const admittedObjectValues = Object.values({ value: raw }).map((value) =>
	Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(value),
);

const coordinated = Effect.forEach(items, processItem, { concurrency: 1 });
const parallel = Effect.forEach(items, processItem, { concurrency: 8 });
const unbounded = Effect.forEach(items, processItem, { concurrency: "unbounded" });

const workflow = Effect.gen(function* () {
	const done = yield* Deferred.make<void>();
	yield* Effect.yieldNow;
	yield* Effect.fail({ _tag: "AccountNotFound", accountId: id } satisfies AccountNotFound);
	yield* Deferred.succeed(done, undefined);
	return yield* Deferred.await(done);
});

const atomicRefUpdate = Effect.gen(function* () {
	const state = yield* Ref.make(0);
	yield* Ref.update(state, (value) => value + 1);
});

const managedScope = Effect.acquireRelease(Scope.make(), release);

interface RequiredDomainProperties {
	maybeValue: Option.Option<string>;
}

class RequiredDomainClass {
	maybeValue: Option.Option<string> = Option.none();
}

const safeFiberOperation = Effect.gen(function* () {
	yield* Fiber.interrupt(fiber);
	return yield* Fiber.join(fiber);
});

const controlledRepository = Layer.succeed(AccountRepository, {
	findById: (accountId: AccountId): AccountEffect =>
		accountNotFound(accountId),
});

test("conditional assertions remain non-vacuous", () => {
	expect.assertions(1);
	if (condition) expect(condition).toBe(true);
});

const optionsProjection = { id: input.id } satisfies { id: string };

type Handler<Input> = (input: Input) => void;
const handler: Handler<DomainItem> = (item) => void project(item);

import type { DomainItem as ImportedDomainItem } from "./domain-types.js";
export type { ImportedDomainItem };
type ConsistentFields = { id: string };
for (const item of items) {
	void processItem(item);
}

const dispose = async (): Promise<void> => {
	await runtime.dispose();
};

const hostValue = Effect.try({
	try: foreignCall,
	catch: (error) => error,
});

const assertedValue = (() => {
	// SAFETY: the schema above proves this value has the DomainValue shape.
	return decoded as DomainValue;
})();

void inlineSnapshot;
void projected;
void conditionalItems;
void projectedObject;
void constructed;
void resources;
void values;
void options;
void stableInventory;
void namedResult;
void namedAlias;
void app;
void maybeApp;
void dynamicValue;
void callbackValue;
void normalized;
void explicitSchedule;
void explicitSleep;
void inertEffectFactory;
void deferredMutation;
void constantProjection;
void emptyContext;
void concreteResourceConfig;
void admittedObjectValues;
void coordinated;
void parallel;
void unbounded;
void workflow;
void atomicRefUpdate;
void managedScope;
void RequiredDomainProperties;
void RequiredDomainClass;
void safeFiberOperation;
void controlledRepository;
void optionsProjection;
void handler;
void dispose;
void hostValue;
void assertedValue;
void cause;
void parsedValue;
void inferredGeneric;
void explicitGeneric;
void label;
void branch;
void findDomainValue;
void validateDomainValue;
