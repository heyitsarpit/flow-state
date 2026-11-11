// Round 14: rule 73's cases (2.7.17, OD31), written in the public API. A chain of finite work (Pay's confirm, a cart read, `place`), a read a
// press starts, a debounced save, and a heartbeat whose write can outlast its period. `log` is what this incarnation heard, in order.
import { Schema } from "effect";
import { definition, Flow, machine, resource, transaction } from "../compile/index.ts";
import { call, FakeApi, fixture, write } from "./lab.ts";

export const LifeId = "Lab/Life";
const S = Schema;
const U = S.Unknown;
const confirm = transaction({ id: "life/confirm", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write("confirm") });
const place = transaction({ id: "life/place", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write("place") });
const save = transaction({ id: "life/save", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write("save") });
const ping = transaction({ id: "life/ping", input: {}, key: [], concurrency: "reject", services: [FakeApi], commit: write("ping") });
const cart = resource({ id: "life/cart", input: {}, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("cart")(i) });
const look = resource({ id: "life/look", input: {}, key: [], services: [FakeApi], lookup: (i) => call<unknown, "NoResponse">("look")(i) });
const life = (persisted: boolean, local = false) => {
  const d = definition({
    id: LifeId,
    states: ["IDLE", "CONFIRMING", "REFRESHING", "PLACING", "DONE", "LOOKING", "DIRTY", "BEAT"],
    events: { Confirm: {}, Look: {}, Edit: {}, Beat: {}, Stop: {}, Poison: {}, Heal: {} },
    internalEvents: {
      Confirmed: {}, ConfirmNo: {}, ConfirmUnsure: Flow.uncertain({}),
      CartRead: {}, CartFailed: {},
      Placed: {}, PlaceNo: {}, PlaceUnsure: Flow.uncertain({}),
      Looked: {}, LookFailed: {},
      SaveDue: {}, Saved: {}, SaveNo: {}, SaveUnsure: Flow.uncertain({}),
      BeatDue: {}, Pinged: {}, PingNo: {}, PingUnsure: Flow.uncertain({}),
    },
    memory: { log: Flow.initial(S.Array(S.String), []), blob: Flow.initial(U, null) }, // `blob`: a bigint cannot encode (LIFE-22, as HIGH-02)
    persist: persisted,
    ...(local ? { local: true as const } : {}),
    operations: ({ E }) => ({
      confirm: confirm.outcomes({ success: E.Confirmed, failure: { NotSent: E.ConfirmNo }, unknown: E.ConfirmUnsure }),
      place: place.outcomes({ success: E.Placed, failure: { NotSent: E.PlaceNo }, unknown: E.PlaceUnsure }),
      save: save.outcomes({ success: E.Saved, failure: { NotSent: E.SaveNo }, unknown: E.SaveUnsure }),
      ping: ping.outcomes({ success: E.Pinged, failure: { NotSent: E.PingNo }, unknown: E.PingUnsure }),
      cart: cart.outcomes({ success: E.CartRead, failure: { NoResponse: E.CartFailed, Defect: E.CartFailed, Interrupted: E.CartFailed } }),
      look: look.outcomes({ success: E.Looked, failure: { NoResponse: E.LookFailed, Defect: E.LookFailed, Interrupted: E.LookFailed } }),
    }),
  });
  return machine(d, ({ S: St, E, O }) => {
    const heard = (what: string) => ({ memory }: { memory: { log: readonly string[] } }) => ({ log: [...memory.log, what] });
    return {
      default: St.IDLE,
      on: {
        Confirm: { target: St.CONFIRMING, actions: [O.confirm.commit(() => ({}))] },
        Confirmed: { target: St.REFRESHING, updateMemory: heard("confirmed"), actions: [O.cart.lookup(() => ({}))] },
        CartRead: { target: St.PLACING, updateMemory: heard("cart"), actions: [O.place.commit(() => ({}))] },
        Placed: { target: St.DONE, updateMemory: heard("placed") },
        ConfirmNo: { target: St.IDLE, updateMemory: heard("confirmNo") },
        ConfirmUnsure: { target: St.IDLE, updateMemory: heard("confirmUnsure") },
        CartFailed: { target: St.IDLE, updateMemory: heard("cartFailed") },
        PlaceNo: { target: St.IDLE, updateMemory: heard("placeNo") },
        PlaceUnsure: { target: St.IDLE, updateMemory: heard("placeUnsure") },
        Look: { target: St.LOOKING, actions: [O.look.lookup(() => ({}))] },
        Looked: { target: St.IDLE, updateMemory: heard("looked") },
        LookFailed: { target: St.IDLE, updateMemory: heard("lookFailed") },
        Edit: St.DIRTY,
        SaveDue: { target: St.IDLE, updateMemory: heard("saveDue"), actions: [O.save.commit(() => ({}))] },
        Saved: { updateMemory: heard("saved") },
        SaveNo: { updateMemory: heard("saveNo") },
        SaveUnsure: { updateMemory: heard("saveUnsure") },
        Beat: St.BEAT,
        Stop: St.IDLE,
        Poison: { updateMemory: () => ({ blob: 10n }) },
        Heal: { updateMemory: () => ({ blob: null }) },
        Pinged: { updateMemory: heard("pinged") },
        PingNo: { updateMemory: heard("pingNo") },
        PingUnsure: { updateMemory: heard("pingUnsure") },
      },
      states: {
        // Another edit while dirty re-arms the debounce in the same activation (round 14 review M1).
        DIRTY: { schedules: { save: { schedule: "50 millis", send: E.SaveDue, armOn: ["entry", "Edit"] } }, on: { Edit: {} } },
        BEAT: {
          schedules: { beat: { schedule: "30 millis", send: E.BeatDue, armOn: ["entry", "BeatDue"] } },
          on: { BeatDue: { updateMemory: heard("beat"), actions: [O.ping.commit(() => ({}))] } },
        },
      },
    };
  });
};
const lifeP = fixture(life(true));
const lifeU = fixture(life(false));
const lifeL = fixture(life(false, true));
export const lifeFixture = (o: { persisted?: boolean; local?: boolean } = {}) => (o.local ? lifeL : (o.persisted ?? true) ? lifeP : lifeU);
