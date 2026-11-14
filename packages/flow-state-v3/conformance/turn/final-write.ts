import { Option } from "effect";
import { type Kept, savedAs, type State } from "./anchor.ts";

/**
 * The Runtime's disposal while it runs (Actors R23): what its final write holds, each actor's
 * turns and fields when the disposal began, and whether the store refused a write or left one
 * unanswered at the bound since.
 */
export type FinalWrite = {
  readonly holds: ReadonlyMap<string, Kept>;
  readonly refused: boolean;
};

/**
 * The Runtime's disposal began: its final write will hold each actor's turns and fields as they
 * stand now (Actors R23; a turn after it may be lost, a stated limit). A second dispose restarts
 * nothing (Actors I43), so the first one's record stands.
 */
export const disposing = (state: State) => ({
  ...state,
  disposal: Option.isSome(state.disposal)
    ? state.disposal
    : Option.some({
        holds: new Map(
          [...state.actors].map(([key, a]) => [key, { turns: a.turns, fields: a.fields }]),
        ),
        refused: false,
      }),
});

/**
 * The store refused a write, or left one unanswered at the bound, while the Runtime disposed: its
 * final write may not have landed.
 */
export const finalRefused = (state: State) => ({
  ...state,
  disposal: Option.map(state.disposal, (w) => ({ ...w, refused: true })),
});

/**
 * The Runtime's disposal ended (Actors R23, I44). Ended `Done` with no refused write, its final
 * write landed, so each actor's record holds at least what the write held and a reload restores
 * it; after `CleanupFailed` or a refused write, nothing more is known.
 */
export const disposalEnded = (state: State, done: boolean) =>
  Option.match(
    Option.filter(state.disposal, (w) => done && !w.refused),
    {
      onNone: () => state,
      onSome: (w) => ({
        ...state,
        actors: new Map(
          [...state.actors].map(([key, a]) => {
            const kept = w.holds.get(key);

            return [key, kept === undefined || kept.turns < a.saved.turns ? a : savedAs(a, kept)];
          }),
        ),
      }),
    },
  );
