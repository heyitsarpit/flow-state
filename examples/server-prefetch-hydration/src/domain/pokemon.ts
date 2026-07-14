import { Data } from "effect";

export type PokemonName = "pikachu" | "eevee";

export interface Pokemon {
  readonly name: PokemonName;
  readonly displayName: string;
  readonly sprite: string;
  readonly requestId: string;
}

export class PokemonUnavailable extends Data.TaggedError("PokemonUnavailable")<{
  readonly name: PokemonName;
  readonly message: string;
}> {}
