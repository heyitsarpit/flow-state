import { Effect, Layer, Option, Schema } from "effect";
import { actorRef, app, definition, deny, Flow, machine, runtimeSetup } from "../../src/index.ts";
import {
  type Command,
  Entries,
  findCommand,
  pageOf,
  ranked,
  Scores,
  shownCommands,
} from "./commands.ts";
import { type CommandFailed, CommandsApi, runCommand } from "./contracts.ts";

const Palette = definition({
  id: "Palette/Palette",
  persist: true,
  states: ["READY"],
  events: {
    Configure: { commands: Entries, autoHighlight: Schema.Boolean, scores: Scores },
    Typed: { text: Schema.String },
    Highlight: { key: Schema.String },
    Move: { by: Schema.Literals([-1, 1]) },
    Run: { key: Schema.String },
    Enter: {},
    Back: {},
    Escape: {},
  },
  internalEvents: {
    Ran: {},
    RunFailed: { command: Schema.String, reason: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: {
    commands: Flow.initial(Entries, []),
    autoHighlight: Flow.initial(Schema.Boolean, true),
    scores: Flow.initial(Scores, null),
    query: Flow.initial(Schema.String, ""),
    pages: Flow.initial(Schema.Array(Schema.String), []),
    queries: Flow.initial(Schema.Array(Schema.String), []),
    highlighted: Flow.initial(Schema.NullOr(Schema.String), null),
    errors: Flow.initial(Schema.Record(Schema.String, Schema.String), {}),
  },
  operations: ({ E }) => ({
    run: runCommand.outcomes({
      success: E.Ran,
      failure: {
        CommandFailed: E.RunFailed.from((e: CommandFailed) => ({
          command: e.command,
          reason: e.reason,
        })),
      },
      unknown: E.Unsure,
    }),
  }),
});

type Fields = typeof Palette.memory;

/**
 * A palette's memory, as its views read it.
 */
export type PaletteMemory = { readonly [K in keyof Fields]: Fields[K]["value"] };

/**
 * The entries the palette shows: the open page's, ranked by the query.
 */
export const resultsOf = (memory: PaletteMemory) =>
  ranked(
    Option.getOrElse(pageOf(memory.commands, memory.pages), () => []),
    memory.query,
    memory.scores,
  );

const enabledOf = (memory: PaletteMemory) =>
  shownCommands(resultsOf(memory)).filter((c) => !c.disabled);

const highlighted = (memory: PaletteMemory) => {
  const shown = enabledOf(memory);
  const chosen = Option.fromUndefinedOr(shown.find((c) => c.value === memory.highlighted));
  const first = memory.autoHighlight ? Option.fromUndefinedOr(shown[0]) : Option.none();

  return Option.map(
    Option.orElse(chosen, () => first),
    (c) => c.value,
  );
};

/**
 * The highlighted command: the one chosen while it is still shown and enabled; otherwise the
 * first enabled one, or none (null) without auto-highlight.
 */
export const highlightOf = (memory: PaletteMemory) => Option.getOrNull(highlighted(memory));

const movedBy = (memory: PaletteMemory, by: -1 | 1) => {
  const shown = enabledOf(memory);
  const at = shown.findIndex((c) => c.value === highlightOf(memory));
  const fresh = by > 0 ? 0 : shown.length - 1;
  const next = at < 0 ? fresh : (at + by + shown.length) % shown.length;

  return shown[next]?.value ?? null;
};

const opened = (memory: PaletteMemory, page: string) => ({
  pages: [...memory.pages, page],
  queries: [...memory.queries, memory.query],
  query: "",
  highlighted: null,
});

const closed = (memory: PaletteMemory) => ({
  pages: memory.pages.slice(0, -1),
  queries: memory.queries.slice(0, -1),
  query: memory.queries.at(-1) ?? "",
  highlighted: null,
});

const withoutKey = (errors: Readonly<Record<string, string>>, key: string) =>
  Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key));

type Picked<P> = { readonly memory: PaletteMemory; readonly event: P };

type Pick<P> = (input: Picked<P>) => Option.Option<string>;

const commandOf = <P>(pick: Pick<P>, input: Picked<P>) =>
  Option.flatMap(pick(input), (key) => findCommand(input.memory.commands, key));

const known =
  <P>(pick: Pick<P>) =>
  (input: Picked<P>) =>
    Option.isSome(commandOf(pick, input)) || deny("Unknown");

const enabled =
  <P>(pick: Pick<P>) =>
  (input: Picked<P>) =>
    !Option.exists(commandOf(pick, input), (c) => c.disabled) || deny("Disabled");

const hasPage =
  <P>(pick: Pick<P>) =>
  (input: Picked<P>) =>
    Option.exists(commandOf(pick, input), (c) => c.items.length > 0) || deny("NoPage");

const byKey = ({ event }: { readonly event: { readonly key: string } }) => Option.some(event.key);

const byHighlight = ({ memory }: { readonly memory: PaletteMemory }) => highlighted(memory);

/**
 * A command palette: typing ranks the commands and highlights the best match; Run or Enter runs a
 * command, or opens its page when it has sub-commands; Back and Escape step back; each command
 * runs on its own keyed write, so a running command cannot run again while others can, a failed
 * one keeps its reason until it runs again, and an unknown one may be run once more.
 */
export const PaletteMachine = machine(Palette, ({ S, O }) => {
  const runs = <P>(pick: Pick<P>) => {
    const key = (input: Picked<P>) => Option.getOrElse(pick(input), () => "");
    const command = (input: Picked<P>) => ({ command: key(input) });

    return [
      {
        guard: [known(pick), enabled(pick), hasPage(pick)],
        updateMemory: (input: Picked<P>) => opened(input.memory, key(input)),
      },
      {
        guard: [known(pick), enabled(pick), O.run.idle(command)],
        updateMemory: (input: Picked<P>) => ({
          errors: withoutKey(input.memory.errors, key(input)),
        }),
        actions: [O.run.commit(command)],
      },
      {
        guard: [known(pick), enabled(pick), O.run.retryable(command, { times: 1 })],
        actions: [O.run.retry(command)],
      },
    ];
  };

  return {
    default: S.READY,
    on: {
      Ran: {},
      Unsure: {},
      RunFailed: {
        updateMemory: ({ memory, event }) => ({
          errors: { ...memory.errors, [event.command]: event.reason },
        }),
      },
    },
    states: {
      READY: {
        on: {
          Configure: {
            updateMemory: ({ event }) => ({
              commands: event.commands,
              autoHighlight: event.autoHighlight,
              scores: event.scores,
            }),
          },
          Typed: { updateMemory: ({ event }) => ({ query: event.text, highlighted: null }) },
          Highlight: {
            guard: [
              ({ memory, event }) =>
                enabledOf(memory).some((c: Command) => c.value === event.key) || deny("NotShown"),
            ],
            updateMemory: ({ event }) => ({ highlighted: event.key }),
          },
          Move: {
            guard: [({ memory }) => enabledOf(memory).length > 0 || deny("NothingShown")],
            updateMemory: ({ memory, event }) => ({ highlighted: movedBy(memory, event.by) }),
          },
          Run: runs(byKey),
          Enter: runs(byHighlight),
          Back: {
            guard: [
              ({ memory }) => memory.query === "" || deny("NotEmpty"),
              ({ memory }) => memory.pages.length > 0 || deny("TopPage"),
            ],
            updateMemory: ({ memory }) => closed(memory),
          },
          Escape: [
            {
              guard: [({ memory }) => memory.query !== "" || deny("Empty")],
              updateMemory: () => ({ query: "", highlighted: null }),
            },
            {
              guard: [({ memory }) => memory.pages.length > 0 || deny("TopPage")],
              updateMemory: ({ memory }) => closed(memory),
            },
          ],
        },
      },
    },
  };
});

/**
 * The app's own command actions, as its production Layer: every command does nothing here. A
 * Story never builds it.
 */
export const AppCommands = Layer.succeed(CommandsApi, CommandsApi.of({ run: () => Effect.void }));

/**
 * The palette app: one palette machine.
 */
export const paletteApp = app({ id: "palette", machines: { palette: PaletteMachine } });

/**
 * The palette app's real setup: persisted, each capture written at once.
 */
export const paletteSetup = runtimeSetup({
  app: paletteApp,
  services: AppCommands,
  scope: "palette",
  persistence: { captureMs: 0 },
});

/**
 * The palette most stories use.
 */
export const palette = actorRef(PaletteMachine, "palette-1");
