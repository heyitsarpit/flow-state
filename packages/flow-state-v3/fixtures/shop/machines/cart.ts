import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { addLine, setQuantity } from "../operations/writes.ts";
import { Shopper } from "./shopper.ts";

const Stored = Schema.Struct({ variantId: Schema.String, quantity: Schema.Number });

const Lines = Schema.Record(Schema.String, Stored);

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
  context: { shopper: Flow.context(Shopper.M.name) },
  operations: ({ E }) => ({
    add: addLine.outcomes({
      success: E.Added.from((l) => l),
      failure: { SoldOut: E.AddRefused.from((e) => ({ lineId: e.lineId })) },
      notSent: E.AddNotSent.from((e) => ({ why: e.why })),
      unknown: E.AddUnsure,
    }),
    set: setQuantity.outcomes({
      success: E.QuantitySet.from((l) => l),
      failure: {
        NotEnough: E.QuantityRefused.from((e) => ({
          lineId: e.lineId,
          quantity: e.quantity,
        })),
      },
      notSent: E.QuantityNotSent.from((e) => ({ why: e.why })),
      unknown: E.QuantityUnsure,
    }),
  }),
});

const without = <A>(record: Readonly<Record<string, A>>, key: string) =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

// The answered line replaces the stored one, and 0 removes it.
const answered = (lines: typeof Cart.M.lines.Type, line: typeof Cart.E.Added.Type) =>
  line.quantity === 0
    ? without(lines, line.lineId)
    : { ...lines, [line.lineId]: { variantId: line.variantId, quantity: line.quantity } };

// An answer clears the line's wish when it is the quantity last asked for, or the line is gone.
const settled = (wanted: typeof Cart.M.wanted.Type, lineId: string, quantity: number) =>
  wanted[lineId] === quantity || quantity === 0 ? without(wanted, lineId) : wanted;

/**
 * The cart: one add at a time, each line's quantity edited under `latest`, so quick edits of one
 * line send the first and the last; a refusal touches only its own line. A quantity never answered
 * (unsure, or not sent) names no line, so the cart stops waiting on every wish and asks the
 * shopper to check it; superseded edits are not endings and leave the wish to the last edit.
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
        actions: [
          O.add.commit(({ memory, event }) => ({
            cartId: memory.owner,
            lineId: event.lineId,
            variantId: event.variantId,
          })),
        ],
      },
    ],
    Added: {
      updateMemory: ({ memory, event }) => ({ lines: answered(memory.lines, event), adding: "" }),
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
      {
        guard: [O.add.retryable(({ memory }) => ({ cartId: memory.owner }), { times: 1 })],
        actions: [O.add.retry(({ memory }) => ({ cartId: memory.owner }))],
      },
      { updateMemory: () => ({ adding: "", notice: "check your cart" }) },
    ],
    SetQuantity: {
      guard: [({ memory, event }) => memory.lines[event.lineId] !== undefined || deny("NoLine")],
      updateMemory: ({ memory, event }) => ({
        wanted: { ...memory.wanted, [event.lineId]: event.quantity },
        errors: without(memory.errors, event.lineId),
      }),
      actions: [
        O.set.commit(({ memory, event }) => ({
          cartId: memory.owner,
          lineId: event.lineId,
          quantity: event.quantity,
        })),
      ],
    },
    QuantitySet: {
      updateMemory: ({ memory, event }) => ({
        lines: answered(memory.lines, event),
        wanted: settled(memory.wanted, event.lineId, event.quantity),
      }),
    },
    QuantityRefused: {
      updateMemory: ({ memory, event }) => ({
        wanted: without(memory.wanted, event.lineId),
        errors: { ...memory.errors, [event.lineId]: `only ${String(event.quantity)} left` },
      }),
    },
    QuantityNotSent: {
      updateMemory: ({ event }) => ({ wanted: {}, notice: `not changed: ${event.why}` }),
    },
    QuantityUnsure: { updateMemory: () => ({ wanted: {}, notice: "check your cart" }) },
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
  readonly adding: typeof Cart.M.adding.Type;
  readonly wanted: typeof Cart.M.wanted.Type;
}) => memory.adding !== "" || Object.keys(memory.wanted).length > 0;
