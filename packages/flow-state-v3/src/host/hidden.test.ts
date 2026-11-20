import { Context, Duration, Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { RuntimeDefaults } from "../core/defaults.ts";
import { actorRef, app, definition, Flow, machine } from "../index.ts";
import { Host } from "./host.ts";
import { platformOver, testing } from "./testing/seam.ts";

const Note = definition({
  id: "Hidden/Note",
  persist: true,
  states: ["OPEN"],
  events: { Write: { text: Schema.String } },
  memory: { text: Flow.initial(Schema.String, "") },
});

const NoteMachine = machine(Note, ({ S }) => ({
  default: S.OPEN,
  on: { Write: { updateMemory: ({ event }) => ({ text: event.text }) } },
}));

const notes = app({ id: "hidden", machines: { note: NoteMachine } });

// A tab whose page is hidden from the start and whose store refuses the next `refusals` writes,
// then lands the rest; `refused` counts the refusals the store has answered.
const hiddenTab = (refusals: number) => {
  const left = { left: Array.from({ length: refusals }, () => true as const) };
  const tab = platformOver(new Map(), 1, false, left);
  const host = Context.get(tab.platform, Host);
  const platform = Context.add(tab.platform, Host, Host.of({ ...host, hidden: () => true }));

  const built = testing.build(
    { app: notes, scope: "test", persistence: { captureMs: 0 } },
    platform,
  );

  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a boot over the test store is synchronous
  Effect.runSync(built.runtime.ready());
  tab.settle();

  return { tab, built, refused: () => refusals - left.left.length };
};

describe("a refused batch on a hidden page (WriteAhead R10, I12)", () => {
  it.fails("WriteAhead R10: on a hidden page a refused batch's keys wait one default capture interval, never retried in a loop", () => {
    const { tab, built, refused } = hiddenTab(20);
    built.runtime.ensureActor(actorRef(NoteMachine, "n1")).send({ _tag: "Write", text: "milk" });
    tab.settle();

    expect(refused()).toBe(1);

    tab.advance(Duration.toMillis(RuntimeDefaults.captureInterval));
    tab.settle();

    expect(refused()).toBe(2);
  });
});

// A visible tab at the default capture interval whose page the test hides: `hide` calls every
// hidden listener the Runtime registered, as a visibilitychange to hidden or a pagehide does.
const hidingTab = () => {
  const store = new Map<string, string>();
  const tab = platformOver(store, 1);
  const host = Context.get(tab.platform, Host);
  const listeners = new Set<() => void>();

  const platform = Context.add(
    tab.platform,
    Host,
    Host.of({
      ...host,
      onHidden: (listener) => {
        listeners.add(listener);

        return () => void listeners.delete(listener);
      },
    }),
  );

  const built = testing.build({ app: notes, scope: "test", persistence: {} }, platform);
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a boot over the test store is synchronous
  Effect.runSync(built.runtime.ready());
  tab.settle();

  return {
    tab,
    built,
    store,
    hide: () => {
      for (const listener of listeners) listener();
    },
  };
};

describe("the flush on hide (WriteAhead R10, I12; WriteAhead T5)", () => {
  it("WriteAhead I12: plain memory waiting for the capture interval is issued at once when the page hides", () => {
    const { tab, built, store, hide } = hidingTab();
    const note = built.runtime.ensureActor(actorRef(NoteMachine, "n1"));
    tab.settle();
    const before = store.get("actor/Hidden/Note/n1");

    note.send({ _tag: "Write", text: "milk" });
    tab.settle();

    expect(store.get("actor/Hidden/Note/n1")).toBe(before);

    hide();
    tab.settle();

    expect(store.get("actor/Hidden/Note/n1")).toContain("milk");
  });
});
