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

const profile = actorRef(ProfileMachine, "me");
const greeter = actorRef(GreeterMachine, "header");

const setup = runtimeSetup({
  app: app({
    id: "Slots",
    machines: {
      profile: ProfileMachine,
      greeter: { machine: GreeterMachine, context: { greeting: profile } },
    },
  }),
});

describe("a slot recomputes only when one of its reads changed (Actors R18)", () => {
  it.fails("Actors R18, Turn T16: turns that change only an unread field or only the state run no select", async () => {
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
  it.fails("Compile R19, I18: two definitions of one factory, whose ids the type cannot tell apart, are refused at the second read", () => {
    expect(refusal(totalOf({ a: listOf("a").M.size, b: listOf("b").M.size }))).toEqual([
      ["InvalidConfiguration", "context.total.reads.b"],
    ]);
  });

  it.fails("Compile R19, I18: two definitions under one id are two providers, refused at the second read", () => {
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
  it.fails("Compile R19, I18: a derived read that is not a Flow token is refused at its key", () => {
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

  it.fails("Compile R19, I18: Flow.context given a Schema and no spec is refused at its slot", () => {
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
