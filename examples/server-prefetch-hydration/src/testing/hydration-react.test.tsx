// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "flow-state";
import type { FlowRuntimeBootPayload } from "flow-state/server";

import { PokemonApp } from "../app/app";
import { PokemonUnavailable } from "../domain/pokemon";
import { createPokemonRequestBoot } from "../server/request-boot";
import { createPokemonServiceLayer } from "../services/layers";
import { HydratedPokemonClient } from "../ui/HydratedPokemonClient";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const emptyBoot: FlowRuntimeBootPayload = {
  version: "flow-state/runtime-boot.v1",
  resources: [],
  actors: [],
};

describe("HydratedPokemonClient", () => {
  it("creates one post-commit owner, renders prefetched data first, and cleans up once", async () => {
    const boot = await createPokemonRequestBoot({ requestId: "server-request" });
    const container = document.createElement("div");
    const root = createRoot(container);
    let created = 0;
    let finalized = 0;
    const createRuntime = () => {
      expect(container.textContent).toContain("Preparing Pokémon");
      created += 1;
      return flow.runtime(
        PokemonApp.layer({
          store: flow.store.memory(),
          orchestrators: flow.orchestrators.live(),
          services: [createPokemonServiceLayer("client", { onFinalize: () => (finalized += 1) })],
        }),
      );
    };

    await act(async () =>
      root.render(<HydratedPokemonClient boot={boot} createRuntime={createRuntime} />),
    );
    expect(container.textContent).toContain("I'm Pikachu");
    expect(container.textContent).toContain("Prefetched by server-request");
    expect(container.textContent).not.toContain("Loading Pokémon");
    expect(created).toBe(1);

    await act(async () =>
      root.render(<HydratedPokemonClient boot={boot} createRuntime={createRuntime} />),
    );
    expect(created).toBe(1);

    await act(async () => root.unmount());
    expect(finalized).toBe(1);
  });

  it("shows initial loading and a hydrated typed failure without starting a read", async () => {
    const failure = new PokemonUnavailable({ name: "pikachu", message: "offline fixture" });
    const failedBoot = await createPokemonRequestBoot({
      requestId: "failed-request",
      service: { failWith: failure },
    });
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => root.render(<HydratedPokemonClient boot={emptyBoot} />));
    expect(container.textContent).toContain("Loading Pokémon");

    await act(async () => root.render(<HydratedPokemonClient boot={failedBoot} />));
    expect(container.textContent).toContain("Pokémon unavailable");

    await act(async () => root.unmount());
  });
});
