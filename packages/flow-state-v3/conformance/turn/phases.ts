import { Data, Option } from "effect";

/**
 * Where one actor's leaf stands for the suite: never created or forgotten (`Fresh`), with its
 * record kept (`Stored`: at the leaf the suite last carried across a reload, which a restore keeps;
 * unknown after a disposal, whose record may lag its last turn), live at a leaf the suite carried from facts it owns (`Live`), or live
 * at a leaf the suite cannot know until its next turn (`Unanchored`: a turn the table could not
 * judge, or a use of a stored actor whose leaf was unknown). A reload makes every known actor
 * `Stored`.
 */
export type Phase = Data.TaggedEnum<{
  Fresh: {};
  Stored: { state: Option.Option<string> };
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
 * The leaf the suite carries for an actor: a live one's, or the one a stored record keeps.
 */
export const leafOf = (phase: Phase) =>
  Phase.$match(phase, {
    Fresh: () => Option.none<string>(),
    Stored: ({ state }) => state,
    Live: ({ state }) => Option.some(state),
    Unanchored: () => Option.none<string>(),
  });

const stored = (phase: Phase) => Phase.Stored({ state: leafOf(phase) });

const restored = (phase: Phase) =>
  Option.match(leafOf(phase), {
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
    Ensured: (_input, phase) => restored(phase),
    Disposed: () => Phase.Stored({ state: Option.none() }),
    Forgot: () => Phase.Fresh(),
    Reloaded: (_input, phase) => phase,
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
  Live: {
    Ensured: (_input, phase) => phase,
    Disposed: () => Phase.Stored({ state: Option.none() }),
    Forgot: () => Phase.Fresh(),
    Reloaded: (_input, phase) => stored(phase),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
  Unanchored: {
    Ensured: () => Phase.Unanchored(),
    Disposed: () => Phase.Stored({ state: Option.none() }),
    Forgot: () => Phase.Fresh(),
    Reloaded: (_input, phase) => stored(phase),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
};
