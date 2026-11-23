// Resolving a ticket on site: reason, parts used, the customer's sign-off. A subroutine: the visit screen goes INTO
// it, and nothing else on the screen is done meanwhile.
//
// How this module is different (COVERAGE.md 5.2): built from subroutines, exits and nested fragments. Its steps are
// its own states with `.history` (Back from the discard dialog returns to the exact step, F9); a dialog is a
// subroutine nested inside it (F8, F18); its exits carry data (F10); the host's step bar drives it with a host
// event (F16) and hears its progress through a callback (F17); the host's policy enters only through a guard port
// annotated with its denials (F15, F19); a `Signature` writing trait sits on one node only (F3); and leaving it any
// other way hands its draft back (`whenAbandoned`, F14), so the next entry resumes where the technician was.
import { Schema } from "effect";
import { deny, Flow, subroutine } from "flow-state";
import { ConfirmDiscard } from "./confirm-discard.subroutine.js";
import { PartLine } from "./part-line.trait.js";
import { partByNumber } from "./resolve.contracts.js";
import { Signature } from "./signature.trait.js";

export const Step = Schema.Literals(["reason", "parts", "signoff"]);

export const UsedPart = Schema.Struct({
  partNumber: Schema.String,
  available: Schema.NullOr(Schema.Int),
});

export const Draft = Schema.Struct({
  reason: Schema.String,
  parts: Schema.Array(UsedPart),
  signatureRef: Schema.NullOr(Schema.String),
});

export type Draft = typeof Draft.Type;

export const Resolution = Schema.Struct({
  reason: Schema.String,
  parts: Schema.Array(Schema.String),
  signatureRef: Schema.String,
});

export const ResolveWizard = subroutine(
  {
    id: "ResolveWizard",
    states: [
      { STEPS: ["REASON", "PARTS", { SIGNOFF: Flow.state({ traits: { signature: Signature } }) }] },
      { DISCARD: ConfirmDiscard },
    ],
    default: "STEPS",
    events: {
      ReasonChosen: { reason: Schema.String },
      AddPart: { partNumber: Schema.String },
      Next: {},
      Back: {},
      Cancel: {},
      Submit: {},
    },
    hostEvents: { JumpTo: { step: Step } }, // the host's step bar
    internalEvents: {
      PartFound: { partNumber: Schema.String, available: Schema.Int },
      PartUnknown: { partNumber: Schema.String },
      PartLookupFailed: { partNumber: Schema.String },
    },
    guards: {
      // The host's policy, consulted before the wizard lets a resolution go. Annotated, so Inspection, agents and
      // `check()` explain each refusal without reading the host (2.2.1).
      canResolve: Flow.annotate(Flow.Guard, {
        title: "May resolve",
        description: "Whether this ticket may be closed from the field now.",
        denials: {
          OpenWork: "Another job on this ticket is still open.",
          NotAssignedToYou: "Only the assigned technician resolves on site.",
        },
      }),
    },
    callbacks: {
      onProgressed: Flow.Callback({ step: Step }), // the host's step bar follows the wizard
      onPartAdded: Flow.Callback({ partNumber: Schema.String }), // the host reserves it (a host write: rule 48)
      onDraft: Flow.optional(Flow.Callback({ draft: Draft })), // left without an exit: keep the draft
    },
    exits: {
      Resolved: Flow.Exit({ resolution: Resolution }),
      Abandoned: Flow.Exit({ parts: Schema.Array(Schema.String) }), // what the host must give back
    },
    memory: {
      draft: Flow.input(Draft), // the host seeds it: empty, or what an abandoned entry handed back
      reason: Flow.initial(Schema.String, ({ draft }) => draft.reason),
      parts: Flow.initial(Schema.Array(UsedPart), ({ draft }) => draft.parts), // the `of:` list of `lines`
      signatureRef: Flow.initial(Schema.NullOr(Schema.String), ({ draft }) => draft.signatureRef),
      looking: Flow.initial(Schema.NullOr(Schema.String), null), // the part number the PARTS step waits on
      steps: Flow.private(Flow.initial(Schema.Int, 0)), // F19: bookkeeping no host or view reads
    },
    traits: { lines: PartLine.each({ of: "parts", by: "partNumber", max: 20 }) },
    // A subroutine may own reads (rule 48 forbids only mapped writes under a subroutine).
    operations: ({ E }) => ({
      part: partByNumber.outcomes({
        success: E.PartFound.from((part) => ({
          partNumber: part.partNumber,
          available: part.stock - part.reserved,
        })),
        failure: {
          PartUnknown: E.PartUnknown.from((e) => ({ partNumber: e.partNumber })),
          NoResponse: E.PartLookupFailed.from((_e, { key }) => ({ partNumber: key.partNumber })),
          Defect: E.PartLookupFailed.from((_e, { key }) => ({ partNumber: key.partNumber })),
          Interrupted: E.PartLookupFailed.from((_e, { key }) => ({ partNumber: key.partNumber })),
        },
      }),
    }),
  },
  ({ S, E, O, guards, callbacks, exits }) => {
    const progressed = (step: "reason" | "parts" | "signoff") =>
      callbacks.onProgressed.from(() => ({ step }));
    const counted = ({ memory }: { memory: { steps: number } }) => ({ steps: memory.steps + 1 });
    const addLine =
      (partNumber: string, available: number | null) =>
      ({ memory }: { memory: { parts: ReadonlyArray<{ partNumber: string }> } }) => ({
        parts: [
          ...memory.parts.filter((p) => p.partNumber !== partNumber),
          { partNumber, available },
        ],
        looking: null,
      });

    return {
      traits: {
        lines: {
          input: ({ item }) => ({ partNumber: item.partNumber, available: item.available }),
          callbacks: {
            onRemove: {
              updateMemory: ({ memory, payload }) => ({
                parts: memory.parts.filter((p) => p.partNumber !== payload.partNumber),
              }),
            },
          },
        },
      },
      on: {
        Cancel: S.DISCARD,
        // A late part lookup after the step was left: keep what it says, the wizard does not move (rule 20).
        PartFound: {
          target: "self",
          updateMemory: ({ event }) => addLine(event.partNumber, event.available),
        },
        PartUnknown: { target: "self", updateMemory: () => ({ looking: null }) },
        PartLookupFailed: {
          target: "self",
          updateMemory: ({ event }) => addLine(event.partNumber, null),
        },
        JumpTo: [
          {
            target: S.STEPS.REASON,
            guard: ({ event }) => event.step === "reason" || deny("OtherStep"),
          },
          {
            target: S.STEPS.PARTS,
            guard: ({ event }) => event.step === "parts" || deny("OtherStep"),
          },
          { target: S.STEPS.SIGNOFF },
        ],
      },
      states: {
        STEPS: {
          default: S.STEPS.REASON,
          states: {
            REASON: {
              on: {
                ReasonChosen: {
                  target: "self",
                  updateMemory: ({ event }) => ({ reason: event.reason }),
                },
                Next: {
                  target: S.STEPS.PARTS,
                  guard: ({ memory }) => memory.reason.trim() !== "" || deny("NoReason"),
                  updateMemory: counted,
                  notify: [progressed("parts")],
                },
              },
            },
            // The step waits on a part lookup (R2). A failed lookup lets the step go on with the part unvalidated
            // (R4): the technician has the part in hand, and the server checks it at resolve time.
            PARTS: {
              on: {
                AddPart: {
                  target: "self",
                  updateMemory: ({ event }) => ({ looking: event.partNumber }),
                  actions: [O.part.lookup(({ event }) => ({ partNumber: event.partNumber }))],
                  notify: [
                    callbacks.onPartAdded.from(({ event }) => ({ partNumber: event.partNumber })),
                  ],
                },
                Next: {
                  target: S.STEPS.SIGNOFF,
                  guard: ({ memory }) => memory.looking === null || deny("Looking"),
                  updateMemory: counted,
                  notify: [progressed("signoff")],
                },
                Back: { target: S.STEPS.REASON, notify: [progressed("reason")] },
              },
            },
            SIGNOFF: {
              traits: {
                signature: {
                  callbacks: {
                    onSigned: { updateMemory: ({ payload }) => ({ signatureRef: payload.ref }) },
                  },
                },
              },
              on: {
                Back: { target: S.STEPS.PARTS, notify: [progressed("parts")] },
                Submit: {
                  guard: [
                    guards.canResolve,
                    ({ memory }) => memory.signatureRef !== null || deny("NotSigned"),
                  ],
                  target: exits.Resolved.from(({ memory }) => ({
                    resolution: {
                      reason: memory.reason,
                      parts: memory.parts.map((p) => p.partNumber),
                      signatureRef: memory.signatureRef ?? "",
                    },
                  })),
                },
              },
            },
          },
        },
        // The nested dialog. Keep returns to the exact step it came from (`.history`); Discard leaves the wizard,
        // telling the host which parts to give back.
        DISCARD: {
          exits: {
            Kept: S.STEPS.history,
            Discarded: exits.Abandoned.from(({ memory }) => ({
              parts: memory.parts.map((p) => p.partNumber),
            })),
          },
        },
      },
      // Left any other way (the host's transition exits RESOLVING): hand the draft back, so the next entry resumes it
      // (MD 3.5). Not on an exit.
      whenAbandoned: [
        callbacks.onDraft.from(({ memory }) => ({
          draft: { reason: memory.reason, parts: memory.parts, signatureRef: memory.signatureRef },
        })),
      ],
    };
  },
);
