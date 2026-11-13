// The delivery address step. A subroutine with its own states, one per field, so the help link and Back return the
// customer to the exact field they were in (`.history`), and the view focuses it from `.history.child` (F9). Left
// any other way (Leave, a new cart), it hands its draft back (`whenAbandoned`), so the next entry resumes it
// (MD 3.5's AddressStep, extended with fields).
import { Schema } from "effect";
import { deny, Flow, subroutine } from "flow-state";
import { Address } from "../../adapters/types.js";

export const AddressStep = subroutine(
  {
    id: "AddressStep",
    states: [{ FORM: ["NAME", "STREET", "POSTCODE"] }, "POSTCODE_HELP"],
    default: "FORM",
    events: {
      Changed: { address: Address },
      Next: {},
      Back: {},
      Help: {},
      CloseHelp: {},
      Confirm: {},
    },
    callbacks: {
      onPostcode: Flow.Callback({ postcode: Schema.String }), // the host quotes shipping (a host write: rule 48)
      onDraft: Flow.optional(Flow.Callback({ address: Address })),
    },
    exits: { Done: Flow.Exit({ address: Address }) },
    memory: { address: Flow.input(Address) },
  },
  ({ S, exits, callbacks }) => ({
    on: {
      Changed: { target: "self", updateMemory: ({ event }) => ({ address: event.address }) },
      Help: S.POSTCODE_HELP,
    },
    states: {
      FORM: {
        default: S.FORM.NAME,
        states: {
          NAME: {
            on: {
              Next: {
                target: S.FORM.STREET,
                guard: ({ memory }) => memory.address.name.trim() !== "" || deny("NoName"),
              },
            },
          },
          STREET: { on: { Next: S.FORM.POSTCODE, Back: S.FORM.NAME } },
          POSTCODE: {
            on: {
              Back: S.FORM.STREET,
              // Quote as the customer types; the host's `cancel` lane drops a quote for a postcode they moved past.
              Changed: {
                target: "self",
                updateMemory: ({ event }) => ({ address: event.address }),
                notify: [
                  callbacks.onPostcode.from(({ event }) => ({ postcode: event.address.postcode })),
                ],
              },
              Confirm: {
                guard: ({ memory }) =>
                  /^[A-Z0-9 ]{5,8}$/.test(memory.address.postcode) || deny("BadPostcode"),
                target: exits.Done.from(({ memory }) => ({ address: memory.address })),
              },
            },
          },
        },
      },
      POSTCODE_HELP: { on: { CloseHelp: S.FORM.history } },
    },
    whenAbandoned: [callbacks.onDraft.from(({ memory }) => ({ address: memory.address }))], // not on Done
  }),
);
