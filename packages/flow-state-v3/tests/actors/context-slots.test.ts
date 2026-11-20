import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { checked } from "../rules/rules.ts";
import { refusal } from "../refusals.ts";

const Profile = definition({
  id: "Slots/Profile",
  states: ["AWAY", "HERE"],
  events: { Rename: { name: Schema.String }, Seen: {}, Arrive: {} },
  memory: { name: Flow.initial(Schema.String, ""), seen: Flow.initial(Schema.Number, 0) },
});

const ProfileMachine = machine(Profile, ({ S }) => ({
  default: S.AWAY,
  on: {
    Rename: { updateMemory: ({ event }) => ({ name: event.name }) },
    Seen: { updateMemory: ({ memory }) => ({ seen: memory.seen + 1 }) },
  },
  states: { AWAY: { on: { Arrive: S.HERE } } },
}));

// How many times the greeting's select ran: a select is pure (Actors R19), and the count shows only
// whether a turn ran it.
const selects = { runs: 0 };

const Greeter = definition({
  id: "Slots/Greeter",
  states: ["SHOWN"],
  events: {},
  context: {
    greeting: Flow.context(Schema.String, {
      reads: { name: Profile.M.name },
      select: ({ name }) => {
        selects.runs += 1;

        return `hi ${name}`;
      },
    }),
  },
});

const GreeterMachine = machine(Greeter, ({ S }) => ({ default: S.SHOWN }));

// How many times the name's length was selected: "ada" and "bob" select the same length.
const lengths = { runs: 0 };

const Width = definition({
  id: "Slots/Width",
  states: ["SHOWN"],
  events: {},
  context: {
    length: Flow.context(Schema.Number, {
      reads: { name: Profile.M.name },
      select: ({ name }) => {
        lengths.runs += 1;

        return name.length;
      },
    }),
  },
});

const WidthMachine = machine(Width, ({ S }) => ({ default: S.SHOWN }));

const profile = actorRef(ProfileMachine, "me");
const greeter = actorRef(GreeterMachine, "header");
const width = actorRef(WidthMachine, "name-width");

const setup = runtimeSetup({
  app: app({
    id: "Slots",
    machines: {
      profile: ProfileMachine,
      greeter: { machine: GreeterMachine, context: { greeting: profile } },
    },
  }),
});

const lengthSetup = runtimeSetup({
  app: app({
    id: "Slots",
    machines: {
      profile: ProfileMachine,
      width: { machine: WidthMachine, context: { length: profile } },
    },
  }),
});

describe("a slot recomputes only when one of its reads changed (Actors R18)", () => {
  it("Actors R18, Turn T16: turns that change only an unread field or only the state run no select", async () => {
    const renamed = Story.app(setup, { id: "slots/skip-unchanged", fixtures: [] })
      .ensure(profile)
      .ensure(greeter)
      .send(profile, Profile.E.Rename({ name: "ada" }))
      .checkpoint("renamed");

    const seen = renamed
      .send(profile, Profile.E.Seen())
      .send(profile, Profile.E.Seen())
      .send(profile, Profile.E.Arrive())
      .checkpoint("seen");

    selects.runs = 0;
    const first = checked(await renamed.run());
    const runsToRename = selects.runs;

    selects.runs = 0;
    const second = checked(await seen.run());

    expect(first.checkpoints.renamed.read(greeter)?.context).toEqual({ greeting: "hi ada" });
    expect(second.checkpoints.seen.read(greeter)?.context).toEqual({ greeting: "hi ada" });
    expect(runsToRename > 0).toBe(true);
    // The same runs as the rename alone: the seen and arrive turns change none of the slot's reads.
    expect(selects.runs).toBe(runsToRename);
  });

  it("Actors R18, Turn T16: a change of reads that selects an equal value keeps the new reads, so later turns that change none of them run no select", async () => {
    const renamed = Story.app(lengthSetup, { id: "slots/skip-after-equal", fixtures: [] })
      .ensure(profile)
      .ensure(width)
      .send(profile, Profile.E.Rename({ name: "ada" }))
      .send(profile, Profile.E.Rename({ name: "bob" }))
      .checkpoint("renamed");

    const seen = renamed
      .send(profile, Profile.E.Seen())
      .send(profile, Profile.E.Seen())
      .send(profile, Profile.E.Arrive())
      .checkpoint("seen");

    lengths.runs = 0;
    const first = checked(await renamed.run());
    const runsToRename = lengths.runs;

    lengths.runs = 0;
    const second = checked(await seen.run());

    expect(first.checkpoints.renamed.read(width)?.context).toEqual({ length: 3 });
    expect(second.checkpoints.seen.read(width)?.context).toEqual({ length: 3 });
    // The rename to "bob" ran the select once more for an equal length; the three turns after it
    // change none of its reads.
    expect(runsToRename > 1).toBe(true);
    expect(lengths.runs).toBe(runsToRename);
  });
});

// An alert that rings when the profile's mood turns urgent; a mood with no name has no value, so
// its select throws.
const Alert = definition({
  id: "Slots/Alert",
  states: ["SHOWN"],
  events: {},
  internalEvents: { Urgent: {} },
  memory: { rang: Flow.initial(Schema.Number, 0) },
  context: {
    mood: Flow.context(Schema.String, {
      reads: { name: Profile.M.name },
      select: ({ name }) => {
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a user's select that throws: the defect at admission
        if (name === "") throw new Error("no mood yet");

        return name;
      },
    }),
  },
});

const AlertMachine = machine(Alert, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [C.mood.change({ when: (mood) => mood === "urgent", event: E.Urgent })],
  on: { Urgent: { updateMemory: ({ memory }) => ({ rang: memory.rang + 1 }) } },
}));

const alert = actorRef(AlertMachine, "alert");

const alertSetup = runtimeSetup({
  app: app({
    id: "Slots",
    machines: {
      profile: ProfileMachine,
      alert: { machine: AlertMachine, context: { mood: profile } },
    },
  }),
});

// Inverted until the user chooses how a first value after a failed select meets `when`.
describe("a when-gated reaction rings only when its when allows it (Turn R22)", () => {
  it.fails("Turn R22: a first good value after a select that failed at admission is still judged by when, so a calm mood rings no urgent alert", async () => {
    const calm = (id: string, admitted: string) =>
      Story.app(alertSetup, { id, fixtures: [] })
        .ensure(profile)
        .send(profile, Profile.E.Rename({ name: admitted }))
        .ensure(alert)
        .send(profile, Profile.E.Rename({ name: "calm" }))
        .checkpoint("calm")
        .run();

    const selected = await calm("slots/alert-selected", "x");
    const failed = await calm("slots/alert-failed", "");

    expect(selected.checkpoints.calm.read(alert)?.memory).toEqual({ rang: 0 });
    expect(failed.checkpoints.calm.read(alert)?.memory).toEqual({ rang: 0 });
  });
});

// A factory whose id is not a literal: every list it makes has the same id type.
const listOf = (name: string) =>
  definition({
    id: `Slots/List/${name}`,
    states: ["READY"],
    events: {},
    memory: { size: Flow.initial(Schema.Number, 0) },
  });

// A second definition under Profile's own id, as a stand-in a test or a copy might make.
const Twin = definition({
  id: Profile.id,
  states: ["AWAY"],
  events: {},
  memory: { name: Flow.initial(Schema.String, "") },
});

const totalOf = (reads: Parameters<typeof Flow.context>[1]["reads"]) => () =>
  definition({
    id: "Slots/Total",
    states: ["SHOWN"],
    events: {},
    context: { total: Flow.context(Schema.Number, { reads, select: () => 0 }) },
  });

describe("construction refuses a slot of two providers by definition, not by id (Compile R19)", () => {
  it("Compile R19, I18: two definitions of one factory, whose ids the type cannot tell apart, are refused at the second read", () => {
    expect(refusal(totalOf({ a: listOf("a").M.size, b: listOf("b").M.size }))).toEqual([
      ["InvalidConfiguration", "context.total.reads.b"],
    ]);
  });

  it("Compile R19, I18: two definitions under one id are two providers, refused at the second read", () => {
    expect(refusal(totalOf({ name: Profile.M.name, twin: Twin.M.name }))).toEqual([
      ["InvalidConfiguration", "context.total.reads.twin"],
    ]);
  });

  it("Compile R19: reads of one definition's fields and states are one provider", () => {
    expect(
      refusal(
        totalOf({
          name: Profile.M.name,
          seen: Profile.M.seen,
          here: Profile.S.HERE,
          at: Profile.state,
        }),
      ),
    ).toEqual([]);
  });
});

// A value that is not a Flow token, as plain JavaScript or a cast may pass one.
const notAToken = { "~flow": "memory", "~field": "name" };

const slotOf = (slot: () => unknown) => () =>
  definition({
    id: "Slots/Refused",
    states: ["SHOWN"],
    events: {},
    context: { slot: loose(slot()) },
  });

describe("construction refuses a read that is not a Flow token, and a slot with neither token nor spec (Compile R19)", () => {
  it("Compile R19, I18: a derived read that is not a Flow token is refused at its key", () => {
    expect(
      refusal(
        slotOf(() =>
          Flow.context(Schema.String, {
            reads: { name: Profile.M.name, other: loose(notAToken) },
            select: () => "",
          }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "context.slot.reads.other"]]);
  });

  it("Compile R19, I18: Flow.context given a Schema and no spec is refused at its slot", () => {
    expect(refusal(slotOf(() => Flow.context(loose(Schema.String))))).toEqual([
      ["InvalidConfiguration", "context.slot"],
    ]);
  });
});

// A chat member who is away, or here and idle or typing.
const Member = definition({
  id: "Slots/Member",
  states: ["AWAY", { HERE: ["IDLE", "TYPING"] }],
  events: { Arrive: {}, Type: {}, Leave: {} },
});

const MemberMachine = machine(Member, ({ S }) => ({
  default: S.AWAY,
  on: { Leave: S.AWAY },
  states: {
    AWAY: { on: { Arrive: S.HERE } },
    HERE: { default: S.HERE.IDLE, states: { IDLE: { on: { Type: S.HERE.TYPING } } } },
  },
}));

// The member's dot in the sidebar: lit while the member is here, whichever child state.
const Dot = definition({
  id: "Slots/Dot",
  states: ["SHOWN"],
  events: {},
  context: { here: Flow.context(Member.S.HERE), at: Flow.context(Member.state) },
});

const DotMachine = machine(Dot, ({ S }) => ({ default: S.SHOWN }));

const member = actorRef(MemberMachine, "ada");
const dot = actorRef(DotMachine, "ada-dot");

const memberSetup = runtimeSetup({
  app: app({
    id: "Slots",
    machines: {
      member: MemberMachine,
      dot: { machine: DotMachine, context: { here: member, at: member } },
    },
  }),
});

// A guard: the stub reads state tokens at or below their state already; a build that matches the
// state exactly fails it.
describe("a compound state token reads true in any of its children (Compile R4)", () => {
  it("Compile R4: the dot reads HERE true in HERE.IDLE and in HERE.TYPING, false when away", async () => {
    const run = checked(
      await Story.app(memberSetup, { id: "slots/compound-read", fixtures: [] })
        .ensure(member)
        .ensure(dot)
        .checkpoint("away")
        .send(member, Member.E.Arrive())
        .checkpoint("idle")
        .send(member, Member.E.Type())
        .checkpoint("typing")
        .send(member, Member.E.Leave())
        .checkpoint("left")
        .run(),
    );

    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(dot)?.context;

    expect(at("away")).toEqual({ here: false, at: "AWAY" });
    expect(at("idle")).toEqual({ here: true, at: "HERE.IDLE" });
    expect(at("typing")).toEqual({ here: true, at: "HERE.TYPING" });
    expect(at("left")).toEqual({ here: false, at: "AWAY" });
  });
});

// The member's sidebar entry, which lights when the member arrives.
const Entry = definition({
  id: "Slots/Entry",
  states: ["SHOWN"],
  events: {},
  internalEvents: { Lit: {} },
  context: { here: Flow.context(Member.S.HERE) },
});

describe("only C makes a reaction (Compile R19)", () => {
  it("Compile R19, I18: a reaction in the old shape is refused, and one another machine's C made is refused", () => {
    const made: Array<unknown> = [];

    machine(Entry, ({ S, E, C }) => {
      made.push(C.here.change({ event: E.Lit }));

      return { default: S.SHOWN, on: { Lit: {} } };
    });

    expect(
      refusal(() =>
        machine(Entry, ({ S, E }) =>
          loose({
            default: S.SHOWN,
            onContext: [{ select: () => 1, event: E.Lit }],
            on: { Lit: {} },
          }),
        ),
      ),
    ).toEqual([["InvalidConfiguration", "onContext.0"]]);
    expect(
      refusal(() =>
        machine(Entry, ({ S }) => loose({ default: S.SHOWN, onContext: made, on: { Lit: {} } })),
      ),
    ).toEqual([["InvalidConfiguration", "onContext.0"]]);
    expect(
      refusal(() =>
        machine(Entry, ({ S, E, C }) => ({
          default: S.SHOWN,
          onContext: [C.here.change({ event: E.Lit })],
          on: { Lit: {} },
        })),
      ),
    ).toEqual([]);
  });
});

// The member's sidebar entry, lit by its arrival and by its typing, each heard by its own event.
const Lamp = definition({
  id: "Slots/Lamp",
  states: ["SHOWN"],
  events: {},
  internalEvents: { Lit: {}, Dimmed: {} },
  context: { here: Flow.context(Member.S.HERE), typing: Flow.context(Member.S.HERE.TYPING) },
});

describe("a reaction is named by its slot and event (Compile R19)", () => {
  it("Compile R19, I18: a second reaction of one slot that sends the same event is refused at its place; the same event from another slot, or another event from the same slot, is not", () => {
    expect(
      refusal(() =>
        machine(Lamp, ({ S, E, C }) => ({
          default: S.SHOWN,
          onContext: [
            C.here.change({ when: (here) => here, event: E.Lit }),
            C.here.change({ event: E.Dimmed }),
            C.here.change({ when: (here) => !here, event: E.Lit }),
          ],
          on: { Lit: {}, Dimmed: {} },
        })),
      ),
    ).toEqual([["InvalidConfiguration", "onContext.2"]]);
    expect(
      refusal(() =>
        machine(Lamp, ({ S, E, C }) => ({
          default: S.SHOWN,
          onContext: [
            C.here.change({ event: E.Lit }),
            C.here.change({ event: E.Dimmed }),
            C.typing.change({ event: E.Lit }),
          ],
          on: { Lit: {}, Dimmed: {} },
        })),
      ),
    ).toEqual([]);
  });
});
