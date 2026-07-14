import { Deferred, Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "flow-state";
import { test } from "flow-state/testing";

import { createPokemonTestRuntime } from "../app/runtime";
import { PokemonUnavailable } from "../domain/pokemon";
import { PokemonModule } from "../features/pokemon/module";
import { pokemonResource } from "../features/pokemon/resources";
import { createPokemonRequestBoot } from "../server/request-boot";
import { PokemonClientLive } from "../services/layers";

const hydrationProbe = flow.machine<{}, never, "ready">({
  id: "pokemon.hydration-probe",
  initial: "ready",
  context: () => ({}),
  states: { ready: {} },
});

const HydrationProbeApp = flow.app({
  modules: [
    PokemonModule,
    flow.module("HydrationProbe", { machines: { probe: hydrationProbe } }),
  ] as const,
});

describe("server request boot", () => {
  it("isolates overlapping request runtimes and finalizes both owners", async () => {
    const gate = Effect.runSync(Deferred.make<void>());
    const firstStarted = Effect.runSync(Deferred.make<void>());
    const secondStarted = Effect.runSync(Deferred.make<void>());
    const finalized: Array<string> = [];
    const waitAt = (started: Deferred.Deferred<void>) =>
      Effect.andThen(Effect.asVoid(Deferred.succeed(started, undefined)), Deferred.await(gate));

    const first = createPokemonRequestBoot({
      requestId: "request-a",
      service: { beforeRead: waitAt(firstStarted), onFinalize: () => finalized.push("request-a") },
    });
    const second = createPokemonRequestBoot({
      requestId: "request-b",
      service: {
        beforeRead: waitAt(secondStarted),
        onFinalize: () => finalized.push("request-b"),
      },
    });

    await Effect.runPromise(
      Effect.all([Deferred.await(firstStarted), Deferred.await(secondStarted)], {
        concurrency: "unbounded",
      }),
    );
    Effect.runSync(Deferred.succeed(gate, undefined));

    const [firstBoot, secondBoot] = await Promise.all([first, second]);
    expect(firstBoot.resources[0]?.snapshot.value).toMatchObject({ requestId: "request-a" });
    expect(secondBoot.resources[0]?.snapshot.value).toMatchObject({ requestId: "request-b" });
    expect(finalized.sort()).toEqual(["request-a", "request-b"]);
  });

  it("keeps keyed entries independent and preserves typed failure snapshots", async () => {
    const runtime = createPokemonTestRuntime();
    const failedRuntime = createPokemonTestRuntime();
    const pikachu = await createPokemonRequestBoot({ requestId: "pikachu-request" });
    const eevee = await createPokemonRequestBoot({ requestId: "eevee-request", name: "eevee" });
    const failure = new PokemonUnavailable({ name: "pikachu", message: "fixture unavailable" });
    const failedBoot = await createPokemonRequestBoot({
      requestId: "failed-request",
      service: { failWith: failure },
    });

    try {
      runtime.hydrateBoot(pikachu);
      runtime.hydrateBoot(eevee);
      expect(runtime.resources.get(pokemonResource.ref("pikachu"))?.value).toMatchObject({
        requestId: "pikachu-request",
      });
      expect(runtime.resources.get(pokemonResource.ref("eevee"))?.value).toMatchObject({
        requestId: "eevee-request",
      });

      failedRuntime.hydrateBoot(failedBoot);
      expect(failedRuntime.resources.get(pokemonResource.ref("pikachu"))).toMatchObject({
        status: "failure",
        error: { _tag: "PokemonUnavailable", message: "fixture unavailable" },
      });
    } finally {
      await runtime.dispose();
      await failedRuntime.dispose();
    }
  });

  it("rejects invalid boot atomically and hydrates the same boot deterministically", async () => {
    const runtime = createPokemonTestRuntime();
    const boot = await createPokemonRequestBoot({ requestId: "stable-request" });
    const empty = runtime.dehydrateBoot();

    try {
      expect(() =>
        runtime.hydrateBoot({ ...boot, version: "flow-state/runtime-boot.v999" }),
      ).toThrow();
      expect(runtime.dehydrateBoot()).toEqual(empty);

      runtime.hydrateBoot(boot);
      const first = runtime.dehydrateBoot();
      runtime.hydrateBoot(boot);
      expect(runtime.dehydrateBoot()).toEqual(first);
    } finally {
      await runtime.dispose();
    }
  });

  it("restores a server boot through the application test rehydration harness", async () => {
    const boot = await createPokemonRequestBoot({ requestId: "harness-request" });
    const restore = () =>
      test.app(HydrationProbeApp).rehydrate(hydrationProbe, {
        snapshot: hydrationProbe.getInitialSnapshot(),
        boot,
        provide: PokemonClientLive,
      });
    const first = restore();
    const second = restore();

    try {
      expect(first.runtime.resources.get(pokemonResource.ref("pikachu"))?.value).toMatchObject({
        requestId: "harness-request",
      });
      expect(second.runtime.resources.get(pokemonResource.ref("pikachu"))).toEqual(
        first.runtime.resources.get(pokemonResource.ref("pikachu")),
      );
      expect(second.serialize()).toEqual(first.serialize());
    } finally {
      await first.dispose();
      await second.dispose();
    }
  });
});
