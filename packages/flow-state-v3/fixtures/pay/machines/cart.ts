import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { addLine, setQuantity } from "../operations/writes.ts";
import type { NotEnough, SoldOut } from "../services.ts";
import { Shopper } from "./shopper.ts";

const Stored = Schema.Struct({ variantId: Schema.String, quantity: Schema.Number });

const Lines = Schema.Record(Schema.String, Stored);

type Line = { readonly lineId: string; readonly variantId: string; readonly quantity: number };

/**
 * A shopper's cart, named by its owner: its lines as the cart service last answered, the
 * quantities the shopper asked for that are not answered yet, the line being added, and each
 * line's last refusal.
 */
export const Cart = definition({
  id: "Shop/Cart",
  persist: true,
  states: ["OPEN"],
  events: {
    Add: { lineId: Schema.String, variantId: Schema.String },
    SetQuantity: { lineId: Schema.String, quantity: Schema.Number },
  },
  internalEvents: {
    Added: { lineId: Schema.String, variantId: Schema.String, quantity: Schema.Number },
    AddRefused: { lineId: Schema.String },
    AddNotSent: { why: Schema.String },
    AddUnsure: Flow.uncertain({}),
    QuantitySet: { lineId: Schema.String, variantId: Schema.String, quantity: Schema.Number },
    QuantityRefused: { lineId: Schema.String, quantity: Schema.Number },
    QuantityNotSent: { why: Schema.String },
    QuantityUnsure: Flow.uncertain({}),
  },
  memory: {
    owner: Flow.input(Schema.String),
    lines: Flow.initial(Lines, {}),
    wanted: Flow.initial(Schema.Record(Schema.String, Schema.Number), {}),
    adding: Flow.initial(Schema.String, ""),
    errors: Flow.initial(Schema.Record(Schema.String, Schema.String), {}),
    notice: Flow.initial(Schema.String, ""),
  },
  context: { shopper: Shopper.Provider.select((s) => s.memory.name) },
  operations: ({ E }) => ({
    add: addLine.outcomes({
      success: E.Added.from((l: Line) => l),
      failure: { SoldOut: E.AddRefused.from((e: SoldOut) => ({ lineId: e.lineId })) },
      notSent: E.AddNotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.AddUnsure,
    }),
    set: setQuantity.outcomes({
      success: E.QuantitySet.from((l: Line) => l),
      failure: {
        NotEnough: E.QuantityRefused.from((e: NotEnough) => ({
          lineId: e.lineId,
          quantity: e.quantity,
        })),
      },
      notSent: E.QuantityNotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.QuantityUnsure,
    }),
  }),
});

type Memory = {
  readonly owner: string;
  readonly lines: Readonly<Record<string, typeof Stored.Type>>;
  readonly wanted: Readonly<Record<string, number>>;
  readonly adding: string;
  readonly errors: Readonly<Record<string, string>>;
};

const without = <A>(record: Readonly<Record<string, A>>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

const cartKey = ({ memory }: { readonly memory: Memory }) => ({ cartId: memory.owner });

const adding = ({
  memory,
  event,
}: {
  readonly memory: Memory;
  readonly event: { readonly lineId: string; readonly variantId: string };
}) => ({ cartId: memory.owner, lineId: event.lineId, variantId: event.variantId });

const editing = ({
  memory,
  event,
}: {
  readonly memory: Memory;
  readonly event: { readonly lineId: string; readonly quantity: number };
}) => ({ cartId: memory.owner, lineId: event.lineId, quantity: event.quantity });

// The answered line replaces the stored one, and 0 removes it.
const answered = (memory: Memory, line: Line) =>
  line.quantity === 0
    ? without(memory.lines, line.lineId)
    : { ...memory.lines, [line.lineId]: { variantId: line.variantId, quantity: line.quantity } };

// An answer clears the line's wish only when it is the quantity last asked for.
const settled = (memory: Memory, lineId: string, quantity: number) =>
  memory.wanted[lineId] === quantity ? without(memory.wanted, lineId) : memory.wanted;

/**
 * The cart: one add at a time, each line's quantity edited under `latest`, so quick edits of one
 * line send the first and the last; a refusal touches only its own line.
 */
export const CartMachine = machine(Cart, ({ S, O }) => ({
  default: S.OPEN,
  on: {
    Add: [
      {
        guard: [
          ({ memory }) => memory.adding === "" || deny("AddInFlight"),
          ({ memory, event }) => memory.lines[event.lineId] === undefined || deny("HasLine"),
        ],
        updateMemory: ({ memory, event }) => ({
          adding: event.lineId,
          errors: without(memory.errors, event.lineId),
        }),
        actions: [O.add.commit(adding)],
      },
    ],
    Added: {
      updateMemory: ({ memory, event }) => ({ lines: answered(memory, event), adding: "" }),
    },
    AddRefused: {
      updateMemory: ({ memory, event }) => ({
        adding: "",
        errors: { ...memory.errors, [event.lineId]: "sold out" },
      }),
    },
    AddNotSent: {
      updateMemory: ({ event }) => ({ adding: "", notice: `not added: ${event.why}` }),
    },
    AddUnsure: [
      { guard: [O.add.retryable(cartKey, { times: 1 })], actions: [O.add.retry(cartKey)] },
      { updateMemory: () => ({ adding: "", notice: "check your cart" }) },
    ],
    SetQuantity: {
      guard: [({ memory, event }) => memory.lines[event.lineId] !== undefined || deny("NoLine")],
      updateMemory: ({ memory, event }) => ({
        wanted: { ...memory.wanted, [event.lineId]: event.quantity },
        errors: without(memory.errors, event.lineId),
      }),
      actions: [O.set.commit(editing)],
    },
    QuantitySet: {
      updateMemory: ({ memory, event }) => ({
        lines: answered(memory, event),
        wanted: settled(memory, event.lineId, event.quantity),
      }),
    },
    QuantityRefused: {
      updateMemory: ({ memory, event }) => ({
        wanted: without(memory.wanted, event.lineId),
        errors: { ...memory.errors, [event.lineId]: `only ${String(event.quantity)} left` },
      }),
    },
    QuantityNotSent: { updateMemory: ({ event }) => ({ notice: `not changed: ${event.why}` }) },
    QuantityUnsure: { updateMemory: () => ({ notice: "check your cart" }) },
  },
}));

/**
 * How many items a cart's lines hold.
 */
export const itemsIn = (lines: Readonly<Record<string, { readonly quantity: number }>>) =>
  Object.values(lines).reduce((n, l) => n + l.quantity, 0);

/**
 * Whether a cart still waits on the cart service: an add or a quantity not answered yet.
 */
export const waiting = (memory: {
  readonly adding: string;
  readonly wanted: Readonly<Record<string, number>>;
}) => memory.adding !== "" || Object.keys(memory.wanted).length > 0;
