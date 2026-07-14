"use client";

import { useResource } from "flow-state/react";

import type { PokemonName } from "../domain/pokemon";
import { pokemonResource } from "../features/pokemon/resources";

export function PokemonInfo({ name }: Readonly<{ readonly name: PokemonName }>) {
  const pokemon = useResource(pokemonResource.ref(name));
  if (pokemon === null || pokemon.availability === "empty") return <p>Loading Pokémon…</p>;
  if (pokemon.status === "failure") return <p role="alert">Pokémon unavailable.</p>;
  return (
    <figure>
      <img src={pokemon.value.sprite} height={200} alt={pokemon.value.displayName} />
      <h2>I'm {pokemon.value.displayName}</h2>
      <small>Prefetched by {pokemon.value.requestId}</small>
    </figure>
  );
}
