import { Data, Option } from "effect";

/**
 * Where one actor's leaf stands for the suite: never created or forgotten (`Fresh`), disposed with
 * its record kept (`Stored`), live at a leaf the suite carried from facts it owns (`Live`), or
 * live at a leaf the suite cannot know until its next turn (`Unanchored`: restored after a reload
 * or a use of a disposed actor, or after a turn the table could not judge).
 */
export type Phase = Data.TaggedEnum<{
  Fresh: {};
  Stored: {};
  Live: { state: string };
  Unanchored: {};
}>;

/**
 * Constructors and matchers for {@link Phase}.
 */
export const Phase = Data.taggedEnum<Phase>();

/**
 * What moves a phase: the suite attached a use, disposed or forgot the actor, or reloaded the
 * page; or the runtime reported a turn, whose leaf the table judged (`to`, `None` when it could
 * not be told).
 */
export type Input = Data.TaggedEnum<{
  Ensured: { initial: string };
  Disposed: {};
  Forgot: {};
  Reloaded: {};
  Turned: { to: Option.Option<string> };
}>;

/**
 * Constructors and matchers for {@link Input}.
 */
export const Input = Data.taggedEnum<Input>();

const carried = (to: Option.Option<string>) =>
  Option.match(to, {
    onNone: () => Phase.Unanchored(),
    onSome: (state) => Phase.Live({ state }),
  });

/**
 * The one transition table: each phase's next phase for each input.
 */
export const TABLE: {
  readonly [P in Phase["_tag"]]: {
    readonly [I in Input["_tag"]]: (input: Input, phase: Phase) => Phase;
  };
} = {
  Fresh: {
    Ensured: (input) =>
      Input.$is("Ensured")(input) ? Phase.Live({ state: input.initial }) : Phase.Unanchored(),
    Disposed: () => Phase.Fresh(),
    Forgot: () => Phase.Fresh(),
    Reloaded: () => Phase.Fresh(),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
  Stored: {
    Ensured: () => Phase.Unanchored(),
    Disposed: () => Phase.Stored(),
    Forgot: () => Phase.Fresh(),
    Reloaded: () => Phase.Stored(),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
  Live: {
    Ensured: (_input, phase) => phase,
    Disposed: () => Phase.Stored(),
    Forgot: () => Phase.Fresh(),
    Reloaded: () => Phase.Stored(),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
  Unanchored: {
    Ensured: () => Phase.Unanchored(),
    Disposed: () => Phase.Stored(),
    Forgot: () => Phase.Fresh(),
    Reloaded: () => Phase.Stored(),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
};
