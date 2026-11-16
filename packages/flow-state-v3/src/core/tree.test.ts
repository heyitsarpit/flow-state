import { Result, Schema, SchemaGetter } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { definition, Flow, machine } from "../index.ts";
import { Target } from "./compiled.ts";
import { create, historyAfter, moveOf } from "./tree.ts";

// A tree with two levels below the root: OFF, ON { IDLE, MEDIA { PLAYING, PAUSED } }.
const Deep = definition({
  id: "Tree/Deep",
  states: ["OFF", { ON: ["IDLE", { MEDIA: ["PLAYING", "PAUSED"] }] }],
  events: {},
});

const { compiled } = machine(Deep, ({ S }) => ({
  default: S.OFF,
  states: {
    ON: {
      default: S.ON.IDLE,
      states: { MEDIA: { default: S.ON.MEDIA.PLAYING } },
    },
  },
}));

const NONE = new Map<string, string>();

const to = (path: string) => Target.State({ path });

describe("a move's exits and entries (Turn R3, I5, I6, model Boundary)", () => {
  it("a handler targeting a strict descendant keeps its own state: only what lies below it changes", () => {
    expect(moveOf(compiled, "ON.MEDIA.PAUSED", "ON.MEDIA", to("ON.MEDIA.PLAYING"), NONE)).toEqual({
      exits: ["ON.MEDIA.PAUSED"],
      enters: ["ON.MEDIA.PLAYING"],
      leaf: "ON.MEDIA.PLAYING",
      target: "ON.MEDIA.PLAYING",
    });
  });

  it("a handler at the root targeting a leaf exits the active chain deepest first and enters the path outermost first", () => {
    expect(moveOf(compiled, "ON.MEDIA.PAUSED", "", to("ON.MEDIA.PLAYING"), NONE)).toEqual({
      exits: ["ON.MEDIA.PAUSED", "ON.MEDIA", "ON"],
      enters: ["ON", "ON.MEDIA", "ON.MEDIA.PLAYING"],
      leaf: "ON.MEDIA.PLAYING",
      target: "ON.MEDIA.PLAYING",
    });
  });

  it("a target naming the handler's own state re-enters it through its defaults", () => {
    expect(moveOf(compiled, "ON.MEDIA.PAUSED", "ON.MEDIA", to("ON.MEDIA"), NONE)).toEqual({
      exits: ["ON.MEDIA.PAUSED", "ON.MEDIA"],
      enters: ["ON.MEDIA", "ON.MEDIA.PLAYING"],
      leaf: "ON.MEDIA.PLAYING",
      target: "ON.MEDIA",
    });
  });

  it("a target naming an active ancestor re-enters it and its descendants through its defaults", () => {
    expect(moveOf(compiled, "ON.MEDIA.PAUSED", "ON.MEDIA.PAUSED", to("ON"), NONE)).toEqual({
      exits: ["ON.MEDIA.PAUSED", "ON.MEDIA", "ON"],
      enters: ["ON", "ON.IDLE"],
      leaf: "ON.IDLE",
      target: "ON",
    });
  });

  it("a sibling target keeps the common ancestor", () => {
    expect(moveOf(compiled, "ON.MEDIA.PAUSED", "ON.MEDIA.PAUSED", to("ON.IDLE"), NONE)).toEqual({
      exits: ["ON.MEDIA.PAUSED", "ON.MEDIA"],
      enters: ["ON.IDLE"],
      leaf: "ON.IDLE",
      target: "ON.IDLE",
    });
  });
});

describe("history (Turn R4)", () => {
  it("a compound's history is its child active when it was last exited, entered through that child's defaults, else its default leaf", () => {
    const leave = moveOf(compiled, "ON.MEDIA.PAUSED", "", to("OFF"), NONE);
    const history = historyAfter(NONE, "ON.MEDIA.PAUSED", leave);
    const back = moveOf(compiled, "OFF", "OFF", Target.History({ path: "ON" }), history);

    expect(history).toEqual(
      new Map([
        ["ON.MEDIA", "ON.MEDIA.PAUSED"],
        ["ON", "ON.MEDIA"],
      ]),
    );
    expect(back.enters).toEqual(["ON", "ON.MEDIA", "ON.MEDIA.PLAYING"]);
    expect(moveOf(compiled, "OFF", "OFF", Target.History({ path: "ON" }), NONE).leaf).toBe(
      "ON.IDLE",
    );
  });
});

// An input field whose decode lowercases: creation must not run it.
const Slug = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform((s: string) => s.toLowerCase()),
    encode: SchemaGetter.transform((s: string) => s),
  }),
);

describe("creation (Compile R6, I7, T4)", () => {
  const Doc = definition({
    id: "Tree/Doc",
    states: ["CLEAN"],
    events: {},
    memory: {
      docId: Flow.input(Slug),
      body: Flow.initial(Schema.String, ""),
      title: Flow.initial(Schema.String, (fields) => `Untitled ${String(fields["docId"])}`),
      words: Flow.initial(Schema.Number, (fields) => String(fields["body"]).length),
      note: Schema.optionalKey(Schema.String),
    },
  });

  const doc = machine(Doc, ({ S }) => ({ default: S.CLEAN })).compiled;

  it("copies the input, then constants, then computed starts that read the input and constant fields", () => {
    expect(create(doc, { docId: "d-1" })).toEqual(
      Result.succeed({ docId: "d-1", body: "", title: "Untitled d-1", words: 0 }),
    );
  });

  it("checks the input by its Schema's type side and refuses a missing or mistyped field", () => {
    expect(Result.isFailure(create(doc, {}))).toBe(true);
    expect(Result.isFailure(create(doc, { docId: 7 }))).toBe(true);
  });

  it("stores the input as given, with no transforming decode", () => {
    expect(create(doc, { docId: "D-1" })).toEqual(
      Result.succeed({ docId: "D-1", body: "", title: "Untitled D-1", words: 0 }),
    );
  });

  it("is a function of its input: equal inputs give equal memory", () => {
    expect(create(doc, { docId: "d-2" })).toEqual(create(doc, { docId: "d-2" }));
  });
});
