// Resolving on site. The wizard alone, in the stand-in host (`Story.fragment`, Y1: a subroutine alone), and the visit
// screen that hosts it (`Story.machine`), over the Desk fake (the real `ResolveHttp` adapter over `Fake.fetch`).
// Transcripts; resolve.test.ts reads them. Module checkpoints (COVERAGE.md section 6, "RW"): `reason`, `parts`,
// `backToReason`, `confirmDiscard`, `resolved`, `leftMidResolve`, `partsReleased`.
import { Layer } from "effect";
import { deny } from "flow-state";
import { Story } from "flow-state/testing";
import { Desk, DeskClient } from "../../testing/desk.fake.js";
import { PendingSignatures, PendingSignaturesLive } from "./resolve-api.js";
import { ResolveWizard } from "./resolve-wizard.subroutine.js";
import { emptyDraft, Visit } from "./visit.definition.js";
import { VisitMachine } from "./visit.machine.js";

const { E } = Visit;

const W = ResolveWizard.E;

export const T42 = { workspaceId: "north", ticketId: "T-42" };

// A signature drawn on the phone, in tab memory (P6). `sig-1` is kept; `sig-lost` never was (a reload cleared it).
const Signed = Layer.effectDiscard(
  PendingSignatures.use((images) => images.keep("sig-1", new Blob([new Uint8Array(2_048)]))),
).pipe(Layer.provideMerge(PendingSignaturesLive));

// --- the wizard alone ---------------------------------------------------------------------------------------

// The steps, Back, and the nested dialog. Keep returns to the exact step it came from (`.history`, F9); the dialog's
// exit is recorded at its own instance path inside the wizard (F8).
export const wizardAlone = Story.fragment(ResolveWizard, {
  id: "resolve/wizard-alone",
  fixtures: [DeskClient, Signed],
})
  .enter({ draft: emptyDraft })
  .checkpoint("reason")
  .send(W.ReasonChosen({ reason: "Bulb replaced" }), W.Next())
  .send(W.AddPart({ partNumber: "BULB-40W" }))
  .checkpoint("parts")
  .send(W.Back())
  .checkpoint("backToReason")
  .send(W.Next(), W.Cancel())
  .checkpoint("confirmDiscard")
  .send(W.DISCARD.Keep())
  .checkpoint("kept")
  .send(W.Next())
  .send(W.signature.Signed({ ref: "sig-1" }))
  .guards({ canResolve: true })
  .send(W.Submit())
  .checkpoint("exited");

// The host's guard port refuses with an annotated denial (F15, F19): `check()` gives the reason and its text.
export const wizardRefused = Story.fragment(ResolveWizard, {
  id: "resolve/wizard-refused",
  fixtures: [DeskClient, Signed],
})
  .enter({ draft: { reason: "Bulb replaced", parts: [], signatureRef: "sig-1" } })
  .send(W.JumpTo({ step: "signoff" })) // a host event, sendable to a fragment alone (2.10.12)
  .guards({ canResolve: deny("NotAssignedToYou") }) // the stand-in's answer, as a real host's would be
  .send(W.Submit())
  .checkpoint("refused");

// --- the visit screen ---------------------------------------------------------------------------------------

type World = NonNullable<Parameters<typeof Story.machine>[1]["world"]>;

const visit = (id: string, world: World = []) =>
  Story.machine(VisitMachine, {
    id,
    input: { ...T42, assignee: "dispatcher-7" },
    context: { me: "dispatcher-7" },
    fixtures: [DeskClient, Signed],
    world,
  });

const throughParts = (story: ReturnType<typeof visit>) =>
  story
    .send(E.StartResolve())
    .send(E.RESOLVING.ReasonChosen({ reason: "Bulb replaced" }), E.RESOLVING.Next())
    .send(E.RESOLVING.AddPart({ partNumber: "BULB-40W" })); // a lookup the step waits on, and the host's reservation

// The whole visit: reason, a part (reserved by the host when the wizard reports it), sign-off, resolve. The
// signature's upload is the trait's bare write: its row shows progress on the step (O17).
export const resolved = throughParts(
  visit("resolve/resolved", [Desk.signature.hold({ at: "response" })]),
)
  .send(E.RESOLVING.Next())
  .send(E.RESOLVING.signature.Signed({ ref: "sig-1" }))
  .checkpoint("signing")
  .world(Desk.signature.release())
  .send(E.RESOLVING.Submit())
  .checkpoint("resolved");

// The signature never reached the server (its upload was lost, and it is a bare write: nobody heard). The server
// refuses the resolution (`SignatureMissing`): the visit goes back into the wizard to sign again.
export const signatureMissing = throughParts(
  visit("resolve/signature-missing", [Desk.signature.drop({ times: 1 })]),
)
  .send(E.RESOLVING.Next(), E.RESOLVING.signature.Signed({ ref: "sig-1" }), E.RESOLVING.Submit())
  .checkpoint("signAgain");

// The step bar jumps (F16): the host raises the wizard's host event, and the wizard decides.
export const steppedBack = throughParts(visit("resolve/stepped-back"))
  .send(E.StepChosen({ step: "reason" }))
  .checkpoint("jumped");

// Discard: the nested dialog's Discard leaves the wizard by its `Abandoned` exit, with the parts to give back; the
// host releases them (compensation, O20).
export const partsReleased = throughParts(visit("resolve/parts-released"))
  .send(E.RESOLVING.Cancel(), E.RESOLVING.DISCARD.Discard())
  .checkpoint("partsReleased");

// Called away mid-resolve: the host's transition leaves RESOLVING, the wizard is abandoned (no exit), and its
// `whenAbandoned` hands the draft back in the same turn (F14). Starting again resumes it.
export const leftMidResolve = throughParts(visit("resolve/left-mid-resolve"))
  .send(E.CalledAway())
  .checkpoint("leftMidResolve")
  .send(E.StartResolve())
  .checkpoint("resumed");

// Done before the resolution answers: its ending is then late, and routes to the root (O10).
export const lateAfterLeaving = throughParts(
  visit("resolve/late-after-leaving", [Desk.resolve.hold({ at: "response" })]),
)
  .send(E.RESOLVING.Next(), E.RESOLVING.signature.Signed({ ref: "sig-1" }), E.RESOLVING.Submit())
  .send(E.Done())
  .world(Desk.resolve.release())
  .checkpoint("late");

// The resolution's answer is lost: the lane holds it, RESOLVED says so, and "Check again" re-sends the same
// Attempt (the host owns the hold after the wizard's exit, O15).
export const checkedAgain = throughParts(
  visit("resolve/checked-again", [Desk.resolve.drop({ at: "response", times: 1 })]),
)
  .send(E.RESOLVING.Next(), E.RESOLVING.signature.Signed({ ref: "sig-1" }), E.RESOLVING.Submit())
  .checkpoint("unconfirmed")
  .send(E.CheckAgain())
  .checkpoint("confirmed");
