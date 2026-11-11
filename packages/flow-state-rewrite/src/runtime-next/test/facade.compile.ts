import { Effect, Result, type Types } from "effect";

import { app, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import { machine } from "../../machine/machine.js";
import type { ActorRef } from "../../public/types.js";
import { runtimeSetup } from "../runtime.js";
import type {
  ActorHandle,
  ActorOwnerLease,
  ActorStartOptions,
  Diagnostic,
  Runtime,
} from "../runtime.js";

type Expect<Value extends true> = Value;

const ProviderResult = definition({
  id: "runtime-next/type-provider",
  states: ["ready"],
  events: { ping: "bare" },
  memory: ({ input }: { input: { seed: string } }) => ({ seed: input.seed }),
});

const Provider = Result.getOrThrow(ProviderResult);

const ProviderMachine = Result.getOrThrow(
  machine(ProviderResult, ({ S }) => ({ default: S.ready, states: { ready: {} } })),
);

const ConsumerResult = definition({
  id: "runtime-next/type-consumer",
  states: ["idle"],
  events: { advance: (count: number) => ({ count }) },
  context: { providerState: Provider.select(({ state }) => state) },
});

const Consumer = Result.getOrThrow(ConsumerResult);

const ConsumerMachine = Result.getOrThrow(
  machine(ConsumerResult, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const ForeignResult = definition({
  id: "runtime-next/type-foreign",
  states: ["ready"],
  events: { outside: "bare" },
});

const ForeignMachine = Result.getOrThrow(
  machine(ForeignResult, ({ S }) => ({ default: S.ready, states: { ready: {} } })),
);

const TestApp = app({
  id: "runtime-next/type-app",
  persistenceVersion: "1",
  modules: [
    module({
      id: "runtime-next/type-module",
      machines: { provider: ProviderMachine, consumer: ConsumerMachine },
    }),
  ],
});

declare const providerRef: ActorRef<typeof ProviderMachine>;

declare const consumerRef: ActorRef<typeof ConsumerMachine>;

declare const foreignRef: ActorRef<typeof ForeignMachine>;

export type ProviderSendResult = Expect<
  Types.Equals<ReturnType<ActorHandle<typeof Provider>["send"]>, Result.Result<void, Diagnostic>>
>;

export type ConsumerSendResult = Expect<
  Types.Equals<ReturnType<ActorHandle<typeof Consumer>["send"]>, Result.Result<void, Diagnostic>>
>;

/** Compile-only expressions are checked by the package typecheck; these functions are never called. */
export const facadeTypeProofs = {
  setup: () => {
    const capturedSetup = runtimeSetup({ app: TestApp });
    const admittedApp: typeof TestApp = capturedSetup.app;

    // @ts-expect-error A captured setup cannot replace its admitted App identity.
    capturedSetup.app = TestApp;

    void admittedApp;
  },
  lease: (runtime: Runtime<typeof TestApp>, handle: ActorHandle<typeof Provider>) => {
    const providerOptions: ActorStartOptions<typeof Provider> = { input: { seed: "a" } };

    const consumerOptions: ActorStartOptions<typeof Consumer> = {
      context: { providerState: providerRef },
    };

    const created: Effect.Effect<
      ActorOwnerLease<typeof Provider>,
      Diagnostic
    > = runtime.createActor(ProviderMachine, providerOptions);

    const ensured: Effect.Effect<
      ActorOwnerLease<typeof Consumer>,
      Diagnostic
    > = runtime.ensureActor(consumerRef, consumerOptions);

    const lookup: Effect.Effect<ActorHandle<typeof Consumer> | undefined, Diagnostic> =
      runtime.getActor(consumerRef);

    // @ts-expect-error Provider input is required.
    runtime.createActor(ProviderMachine, {});
    // @ts-expect-error Consumer context is required.
    runtime.ensureActor(consumerRef, {});
    // @ts-expect-error The declared provider slot rejects a consumer ref.
    runtime.ensureActor(consumerRef, { context: { providerState: consumerRef } });
    // @ts-expect-error A foreign machine is outside this App's exact machine set.
    runtime.createActor(ForeignMachine, {});
    // @ts-expect-error A foreign ref cannot be ensured into this App.
    runtime.ensureActor(foreignRef, {});
    // @ts-expect-error A foreign ref cannot be looked up through this App.
    runtime.getActor(foreignRef);
    runtime.createActor(ConsumerMachine, {
      // @ts-expect-error A void-input consumer cannot supply input.
      input: { seed: "a" },
      context: consumerOptions.context,
    });
    // @ts-expect-error Actor handles have no disposal authority.
    handle.dispose();
    // @ts-expect-error Actor refs have no disposal authority.
    providerRef.dispose();
    // @ts-expect-error A lookup result is not an owner lease.
    const owner: Effect.Effect<ActorOwnerLease<typeof Consumer>, Diagnostic> = lookup;

    void created;
    void ensured;
    void owner;
  },
  send: (provider: ActorHandle<typeof Provider>, consumer: ActorHandle<typeof Consumer>) => {
    const providerResult: Result.Result<void, Diagnostic> = provider.send(
      Result.getOrThrow(Provider.E.ping()),
    );

    const consumerResult: Result.Result<void, Diagnostic> = consumer.send(
      Result.getOrThrow(Consumer.E.advance(1)),
    );

    // @ts-expect-error A consumer event cannot enter the provider actor.
    provider.send(Result.getOrThrow(Consumer.E.advance(1)));
    // @ts-expect-error A provider event cannot enter the consumer actor.
    consumer.send(Result.getOrThrow(Provider.E.ping()));

    void providerResult;
    void consumerResult;
  },
} as const;
