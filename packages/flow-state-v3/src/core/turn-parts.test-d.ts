import type { Option } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { Alarm } from "./alarms.ts";
import { type Change, whyOf } from "./change.ts";
import type { Values } from "./compiled.ts";
import type { EvidenceOf, Why } from "./evidence.ts";
import type { Input } from "./input.ts";
import { readsOf } from "./reads.ts";
import type { Command } from "./world.ts";

// The unions of the turn's parts (Changes model, realization) as types, each pinned on both sides:
// the members it has, and a member it must not have refused.

declare const change: Change;

declare const alarm: Alarm;

declare const command: Command;

declare const input: Input;

declare const published: EvidenceOf<"Published">;

const scope = { state: "ON", memory: {}, context: {} };

describe("the unions of the turn's parts (Changes R11, T14, Q5, realization)", () => {
  it("Changes R11: a Change is one of nine tags, and its why is a function of its tag", () => {
    expectTypeOf(change._tag).toEqualTypeOf<
      "Begin" | "Turn" | "Refused" | "Unturned" | "Inputs" | "Lanes" | "Settled" | "Use" | "End"
    >();
    expectTypeOf(whyOf(change)).toEqualTypeOf<Option.Option<Why>>();

    // @ts-expect-error Changes R11: a firing's write before its send is no change
    void (change._tag === "Fired");
  });

  it("Changes T14: an alarm is one of six kinds, and tick's match does not compile without each", () => {
    expectTypeOf(alarm._tag).toEqualTypeOf<
      "Bound" | "Silent" | "Release" | "Collect" | "Grace" | "Schedule"
    >();

    expectTypeOf(
      Alarm.$match(alarm, {
        Bound: () => "bound",
        Silent: () => "silent",
        Release: () => "release",
        Collect: () => "collect",
        Grace: () => "grace",
        Schedule: () => "schedule",
      }),
    ).toEqualTypeOf<string>();

    // @ts-expect-error Changes T14: a match that leaves a kind out does not compile
    Alarm.$match(alarm, {
      Bound: () => "bound",
      Silent: () => "silent",
      Release: () => "release",
      Collect: () => "collect",
      Grace: () => "grace",
    });
  });

  it("Changes realization: the host's one wake is Command.Wake and Input.Tick, with no per-timer command", () => {
    expectTypeOf(command._tag).toEqualTypeOf<
      "Invoke" | "Lookup" | "Interrupt" | "EndWork" | "Wake" | "Sleep" | "Persist" | "Write"
    >();
    expectTypeOf(input._tag).toEqualTypeOf<
      | "Start"
      | "Boot"
      | "BootFailed"
      | "LoadSilent"
      | "Ensure"
      | "Create"
      | "Serve"
      | "Release"
      | "Send"
      | "Settled"
      | "Tick"
      | "Stored"
      | "Refused"
      | "Capture"
      | "DisposeRuntime"
      | "DisposeActor"
      | "Forget"
      | "Run"
      | "CleanupFailed"
    >();

    // @ts-expect-error Changes realization: no host timer is armed per alarm
    void (command._tag === "Arm");
    // @ts-expect-error Changes realization: no host timer is disarmed per alarm
    void (command._tag === "Disarm");
    // @ts-expect-error Changes realization: no input names a timer that fired
    void (input._tag === "Fired");
  });

  it("Changes Q5: Published carries the incarnation and its why", () => {
    expectTypeOf(published.why).toEqualTypeOf<"Begin" | "Turn" | "Other">();
    expectTypeOf(published.incarnation).toEqualTypeOf<string>();

    // @ts-expect-error Changes Q5: an end has no why of its own; Finished stands for it
    void (published.why === "End");
  });

  it("Changes R22: each callback's record is typed by its kind, with what that kind reads", () => {
    expectTypeOf(readsOf(scope, "Guard", { event: {} })).toEqualTypeOf<{
      readonly state: string;
      readonly memory: Values;
      readonly context: Values;
      readonly event: Values;
    }>();
    expectTypeOf(readsOf(scope, "Reaction", {})).toEqualTypeOf<{ readonly memory: Values }>();

    // @ts-expect-error Changes R22: a guard reads its event
    readsOf(scope, "Guard", {});
    // @ts-expect-error Changes R22: a guard reads no time
    readsOf(scope, "Guard", { event: {}, now: 0 });
  });
});
