import { describe, expectTypeOf, it } from "vite-plus/test";
import { Thread } from "../../fixtures/chat/machines/thread.ts";
import { history } from "../../fixtures/chat/operations/reads.ts";
import { send } from "../../fixtures/chat/operations/writes.ts";
import type { Message } from "../../fixtures/chat/services.ts";
import type { ReadWrite, WriteOptions } from "../../src/index.ts";

// Plan Operations O3, O5 (Pending D41): a read change is named by its contract, as Effect's
// `Ref.set` and `Ref.update` name a change: `history.set(key, value)` replaces the data and
// `history.update(key, (current) => next)` derives it. Its key has exactly the read's key fields;
// its data is the read's value. `writes` reads the success value and the input, typed from the
// write's contract. Each pin is two-sided: the right shape needs no annotation, a wrong one does
// not compile.

type History = { readonly messages: ReadonlyArray<typeof Message.Type> };

declare const withExtra: { readonly thread: string; readonly clientId: string };

describe("Plan Operations O3, O5: read changes are typed by their read", () => {
  it("`set` takes the read's key and value, `update` the key and an update of the value", () => {
    expectTypeOf(history.set({ thread: "general" }, { messages: [] })).toEqualTypeOf<ReadWrite>();
    expectTypeOf(
      history.update({ thread: "general" }, (current) => ({ messages: current.messages })),
    ).toEqualTypeOf<ReadWrite>();

    // @ts-expect-error Plan Operations O5: `clientId` is not the history's key
    history.set({ clientId: "c-1" }, { messages: [] });
    // @ts-expect-error Pending D41: a key holds exactly the read's key fields
    history.set(withExtra, { messages: [] });
    // @ts-expect-error Pending D41: the data is the read's value
    history.set({ thread: "general" }, { message: [] });
    // @ts-expect-error Pending D41: `set` takes a value, never an update of it
    history.set({ thread: "general" }, (current: History) => current);
    // @ts-expect-error Pending D41: `update` takes an update, never a value
    history.update({ thread: "general" }, { messages: [] });
    // @ts-expect-error Plan Operations O5: an update returns the read's value
    history.update({ thread: "general" }, (current) => current.messages);
    // @ts-expect-error Pending D41: an update returns the new data; it never declines
    history.update({ thread: "general" }, () => undefined);
    history.update({ thread: "general" }, (current) => {
      // @ts-expect-error Pending D41: an update reads the current data and never changes it
      // oxlint-disable-next-line no-param-reassign -- the planted mutation the type refuses
      current.messages = [];

      return current;
    });
  });

  it("an operation's `writes` reads its success value and input, typed by its contract", () => {
    send.outcomes(
      {
        success: Thread.E.Sent.from((v, { input }) => ({ clientId: input.clientId, id: v.id })),
        failure: {},
        unknown: Thread.E.SendUnsure,
      },
      {
        writes: ({ value, input }) => {
          expectTypeOf(value).toEqualTypeOf<{
            readonly id: string;
            readonly thread: string;
            readonly author: string;
          }>();
          expectTypeOf(input.text).toEqualTypeOf<string>();

          return [history.set({ thread: value.thread }, { messages: [] })];
        },
      },
    );

    expectTypeOf<Parameters<typeof send.outcomes>[1]>().toEqualTypeOf<
      WriteOptions<
        { readonly id: string; readonly thread: string; readonly author: string },
        { readonly thread: string; readonly clientId: string; readonly text: string }
      >
    >();

    send.outcomes(
      {
        success: Thread.E.Sent.from((v, { input }) => ({ clientId: input.clientId, id: v.id })),
        failure: {},
        unknown: Thread.E.SendUnsure,
      },
      // @ts-expect-error Plan Operations O3: `writes` returns read changes, not values
      { writes: ({ value }) => [{ thread: value.thread }] },
    );

    send.outcomes(
      {
        success: Thread.E.Sent.from((v, { input }) => ({ clientId: input.clientId, id: v.id })),
        failure: {},
        unknown: Thread.E.SendUnsure,
      },
      // @ts-expect-error Pending D41: `writes` returns a list of changes, not one record
      { writes: ({ value }) => ({ history: { key: { thread: value.thread }, data: [] } }) },
    );
  });
});
