/**
 * Accepted anti-slop examples.
 *
 * This file is a teaching fixture, not a production module. The RuleTester
 * valid cases are the executable rule proof; this file keeps the preferred
 * forms visible beside all-failing-patterns.ts.
 */

import {
	Context,
	Deferred,
	Duration,
	Effect,
	Fiber,
	Layer,
	Option,
	Ref,
	Result,
	Schedule,
	Schema,
	Scope,
} from "effect";

type AccountId = string & { readonly AccountId: unique symbol };
type Account = { readonly id: AccountId };
type AccountNotFound = { readonly _tag: "AccountNotFound"; readonly accountId: AccountId };
function accountNotFound(accountId: AccountId) {
	return Effect.fail({ _tag: "AccountNotFound", accountId } satisfies AccountNotFound);
}
type AccountEffect = ReturnType<typeof accountNotFound>;
type ResourceId = string & { readonly ResourceId: unique symbol };
type Resource = { readonly id: ResourceId };
type DomainItem = { readonly id: string };
type DomainValue = { readonly id: string };
type Snapshot = { readonly id: string };
type App = { readonly start: () => void };
type Value = { readonly id: string };

type ParsedValue = { readonly id: string };
type Status = "ready" | "blocked";
type GenericValue<T = string> = T;
type AppOptions = { readonly id: string };
type MaybeDomainValue = Option.Option<DomainValue>;

const publicValue = "owned export";
export { publicValue };

declare const raw: unknown;
declare const input: DomainValue;
declare const iterable: Iterable<DomainItem>;
declare const first: boolean;
declare const second: boolean;
declare const inventory: { readonly id: string };
declare const items: readonly DomainItem[];
const processItem = (item: DomainItem) =>
	Effect.try({
		try: () => item.id,
		catch: (error) => error,
	});
declare const client: { fetchAccount: (id: AccountId) => Promise<Account> };
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
declare const record: { readonly key: string };
declare const foreignCall: () => string;
declare const cause: unknown;
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
} satisfies Readonly<Record<ResourceId, Resource>>;
const values: readonly Value[] = [{ id: "value" }];
const stableInventory: Readonly<typeof inventory> = { ...inventory };

const options = {} satisfies { readonly input?: string };
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
	readonly findById: (accountId: AccountId) => AccountEffect;
}

class AccountRepository extends Context.Service<AccountRepository, AccountRepositoryContract>()(
	"AccountRepository",
) {}

class AccountRequestFailed extends Schema.TaggedErrorClass<AccountRequestFailed>()(
	"AccountRequestFailed",
	{ cause: Schema.Unknown },
) {}

const loadAccount = Effect.tryPromise({
	try: () => client.fetchAccount(id),
	catch: (error) => new AccountRequestFailed({ cause: error }),
});

const normalized = input.id.trim();
const explicitSchedule = Schedule.exponential(Duration.millis(100));
const explicitSleep = Duration.seconds(1);

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
	readonly maybeValue: Option.Option<string>;
}

class RequiredDomainClass {
	readonly maybeValue: Option.Option<string> = Option.none();
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

const optionsProjection = { id: input.id } satisfies { readonly id: string };

type Handler<Input> = (input: Input) => void;
const handler: Handler<DomainItem> = (item) => void project(item);

import type { DomainItem as ImportedDomainItem } from "./domain-types.js";
export type { ImportedDomainItem };
type ConsistentFields = { readonly id: string };
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
