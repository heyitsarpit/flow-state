// Round 11: what every typed fixture shares. The fake world is an Effect service, as a real API client is (Pay's `ShopApi`): a commit asks for it,
// and the fixture's `make(api)` provides it, so the Runtime gets `Compiled` with every requirement closed (D205). Where the data comes from: the fake's
// `Api`, which stands for `fetch` or an SDK; Flow is not a network library.
import { Context, Effect } from "effect";
import type { Api, ServerModel } from "../fake-world.ts";
import { Outcome, OutcomeUnknown, type Compiled } from "../fixtures/compiled.ts";
import type { Fixture } from "../harness.ts";
import { provide, type Typed } from "./flow.ts";

export class FakeApi extends Context.Service<FakeApi, Api>()("Flow/Fixture/Api") {}
type Tag<T extends string> = { readonly _tag: T };
// A call to the fake, with the tags it can fail with named, so a contract's `outcomes` is checked against them.
export const call =
  <A = unknown, T extends string = never>(op: string) =>
  (input: unknown, idempotencyKey?: string): Effect.Effect<A, Tag<T>, FakeApi> =>
    Effect.flatMap(Effect.service(FakeApi), (api) =>
      (idempotencyKey === undefined ? api.call(op, input) : api.call(op, input, { idempotencyKey })) as Effect.Effect<A, Tag<T>>,
    );
// The common write: a lost answer or a server error is an unknown (rule 13). The hand fixtures' `unknownWhenLost`, typed.
export const unknownWhenLost = <A, T extends string, R>(
  write: Effect.Effect<A, Tag<T>, R>,
): Effect.Effect<A, Tag<Exclude<T, "NoResponse" | "ServerError">> | OutcomeUnknown<Tag<"NoResponse" | "ServerError">>, R> =>
  Effect.catch(write, (e: Tag<T>) =>
    e._tag === "NoResponse" || e._tag === "ServerError"
      ? Outcome.unknown(e as unknown as Tag<"NoResponse" | "ServerError">)
      : Effect.fail(e as Tag<Exclude<T, "NoResponse" | "ServerError">>),
  );
// A write by its op name, keyed by the Attempt (D106: the idempotency key is the Attempt's id).
export const write =
  <A = unknown, T extends string = never>(op: string) =>
  (input: unknown, c: { readonly attempt: { readonly id: string } }) =>
    unknownWhenLost(call<A, T | "NoResponse" | "ServerError">(op)(input, c.attempt.id));
// A fixture from a typed machine. Every Compiled the suite boots from here went through `machine()`, the compile, and nothing else touched it: the fake is
// given to the Runtime at boot as the service the commits ask for (D211), not wrapped around each commit (`provide`, finding F10).
export const fixture = (typed: Typed<unknown> | ((api: Api) => Typed<unknown>), server?: ServerModel): Fixture & { readonly typed: true } => {
  const make = (api: Api): Compiled => (typeof typed === "function" ? typed(api) : typed).compiled;
  const id = (typeof typed === "function" ? typed(new Proxy({}, { get: () => () => undefined }) as Api) : typed).compiled.id;
  return { id, make, services: (api) => Context.make(FakeApi, api) as Context.Context<never>, typed: true, ...(server ? { server } : {}) };
};
void provide;
