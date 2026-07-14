"use client";

import { useEffect, useState } from "react";

import { FlowProvider } from "flow-state/react";
import type { FlowRuntimeBootPayload } from "flow-state/server";

import type { PokemonName } from "../domain/pokemon";
import { createPokemonClientRuntime } from "../app/runtime";
import { PokemonInfo } from "./PokemonInfo";

type ClientRuntime = ReturnType<typeof createPokemonClientRuntime>;

export type PokemonClientOwner = Readonly<{
  readonly runtime: ClientRuntime;
  readonly dispose: () => Promise<void>;
}>;

export function createPokemonClientOwner(
  boot: FlowRuntimeBootPayload,
  createRuntime: () => ClientRuntime = createPokemonClientRuntime,
): PokemonClientOwner {
  const runtime = createRuntime();
  try {
    runtime.hydrateBoot(boot);
  } catch (error) {
    void runtime.dispose();
    throw error;
  }
  let disposePromise: Promise<void> | undefined;
  return {
    runtime,
    dispose: () => (disposePromise ??= runtime.dispose()),
  };
}

export type HydratedPokemonClientProps = Readonly<{
  readonly boot: FlowRuntimeBootPayload;
  readonly name?: PokemonName;
  readonly createRuntime?: () => ClientRuntime;
}>;

type ClientState =
  | Readonly<{ readonly kind: "waiting" }>
  | Readonly<{
      readonly kind: "ready";
      readonly owner: PokemonClientOwner;
      readonly boot: FlowRuntimeBootPayload;
      readonly createRuntime: () => ClientRuntime;
    }>
  | Readonly<{
      readonly kind: "failure";
      readonly boot: FlowRuntimeBootPayload;
      readonly createRuntime: () => ClientRuntime;
    }>;

export function HydratedPokemonClient({
  boot,
  name = "pikachu",
  createRuntime = createPokemonClientRuntime,
}: HydratedPokemonClientProps) {
  const [state, setState] = useState<ClientState>({ kind: "waiting" });

  useEffect(() => {
    try {
      const owner = createPokemonClientOwner(boot, createRuntime);
      setState({ kind: "ready", owner, boot, createRuntime });
      return () => void owner.dispose();
    } catch {
      setState({ kind: "failure", boot, createRuntime });
      return undefined;
    }
  }, [boot, createRuntime]);

  const current =
    state.kind === "waiting" || state.boot !== boot || state.createRuntime !== createRuntime
      ? ({ kind: "waiting" } as const)
      : state;

  if (current.kind === "waiting") return <main aria-busy="true">Preparing Pokémon…</main>;
  if (current.kind === "failure") return <main role="alert">Pokémon boot unavailable.</main>;

  return (
    <FlowProvider runtime={current.owner.runtime}>
      <main>
        <h1>Pokémon Info</h1>
        <PokemonInfo name={name} />
      </main>
    </FlowProvider>
  );
}
