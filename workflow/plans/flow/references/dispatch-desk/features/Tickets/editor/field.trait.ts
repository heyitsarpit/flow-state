// A value with a synchronous validator (MD 3.1's `Field`): no I/O and no timer at all (F1). Input is never refused:
// `validate` only computes `error`, the validator's denial or null, and `touched` says whether to show it yet. The
// Autosave copy places one per description field and reads `check.value` and `check.error`.
import { Schema } from "effect";
import { type Denial, Flow, trait } from "flow-state";

export const Field = (p: { validate: (value: string) => true | Denial }) => {
  const errorOf = (value: string) => {
    const verdict = p.validate(value);

    return verdict === true ? null : verdict;
  };

  return trait(
    {
      id: "Field",
      events: { Changed: { value: Schema.String } },
      hostEvents: { Reset: { value: Schema.String } },
      memory: {
        value: Flow.input(Schema.String),
        error: Flow.initial(Schema.NullOr(Flow.Denial), ({ value }) => errorOf(value)),
        touched: Flow.initial(Schema.Boolean, false),
      },
    },
    () => ({
      on: {
        Changed: {
          target: "self",
          updateMemory: ({ event }) => ({
            value: event.value,
            error: errorOf(event.value),
            touched: true,
          }),
        },
        Reset: {
          target: "self",
          updateMemory: ({ event }) => ({
            value: event.value,
            error: errorOf(event.value),
            touched: false,
          }),
        },
      },
    }),
  );
};
