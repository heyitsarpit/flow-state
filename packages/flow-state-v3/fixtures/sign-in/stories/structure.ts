import { Schema } from "effect";
import { definition, machine, RuntimeDefaults } from "../../../src/index.ts";
import { ReturnTo } from "../machines/return-to.ts";
import { AuthSession } from "../machines/session.ts";
import { TrustedDevice } from "../machines/trusted-device.ts";
import { me } from "../operations/reads.ts";
import { laptop, mainReturn, mainSession, screen } from "../app.ts";
import { Profiles } from "../server/profiles.ts";
import { LAPTOP_UNTIL, sessionStory, signedIn, trustedStory } from "./usual.ts";
import { LATEST } from "./edges.ts";

const elifSaved = Profiles.saved({ email: "elif@kamp.us", handle: "elif" });

/**
 * Elif, who saved a handle before, signs in; her session is let go and ends; signing out forgets it; it is ensured again.
 */
export const signOutForgets = sessionStory("sign-in/sign-out-forgets")
  .world(elifSaved)
  .ensure(mainSession)
  .send(mainSession, signedIn)
  .detach(mainSession)
  .advance("1 second")
  .dispose(mainSession, { how: "forget" })
  .ensure(mainSession)
  .checkpoint("fresh");

/**
 * The unpersisted sign-in screen is disposed while the session it signed in lives on.
 */
export const screenFirst = sessionStory("sign-in/screen-first")
  .world(elifSaved)
  .ensure(screen)
  .ensure(mainSession)
  .send(mainSession, signedIn)
  .dispose(screen)
  .checkpoint("ended");

/**
 * A new account signs in and reaches CHOOSING with no handle typed; the tab reloads, and the
 * email's prefix, never stored, is submitted, confirmed and saved.
 */
export const reloadedChoosing = sessionStory("sign-in/reloaded-choosing")
  .ensure(mainSession)
  .send(mainSession, signedIn)
  .checkpoint("choosing")
  .reload()
  .checkpoint("reloaded")
  .send(mainSession, AuthSession.E.SubmitHandle())
  .send(mainSession, AuthSession.E.ConfirmHandle())
  .checkpoint("saved");

/**
 * The tab reloads while a handle save is on the wire, the redirect held.
 */
export const reloadedMidHandle = sessionStory("sign-in/reloaded-mid-handle")
  .ensure(mainSession)
  .ensure(mainReturn)
  .send(mainReturn, ReturnTo.E.Save({ route: "/pano", draft: "" }))
  .send(mainSession, signedIn)
  .send(mainSession, AuthSession.E.Handle({ handle: "elif-kaya" }))
  .world(Profiles.setUsername.hold({ at: "response" }))
  .send(mainSession, AuthSession.E.SubmitHandle())
  .reload()
  .checkpoint("reloaded");

/**
 * Elif signs in while the profile read is held; the tab closes before it answers, and the read's
 * abort handler throws as the read is cancelled.
 */
export const readCleanupDies = sessionStory("sign-in/read-cleanup-dies")
  .ensure(mainSession)
  .world(Profiles.me.hold(), Profiles.me.cleanup("dies"))
  .send(mainSession, signedIn)
  .disposeRuntime()
  .checkpoint("closed");

/**
 * Elif submits a handle while its save is held; the tab closes, the disposal's bound passes, and
 * the save's abort handler throws as the save is cancelled.
 */
export const saveCleanupDies = sessionStory("sign-in/save-cleanup-dies")
  .ensure(mainSession)
  .send(mainSession, signedIn)
  .send(mainSession, AuthSession.E.Handle({ handle: "elif-kaya" }))
  .world(Profiles.setUsername.hold(), Profiles.setUsername.cleanup("dies"))
  .send(mainSession, AuthSession.E.SubmitHandle())
  .disposeRuntime()
  .advance(RuntimeDefaults.disposalBound)
  .checkpoint("closed");

/**
 * The session is disposed while the return is bound to it.
 */
export const sessionFirst = () =>
  sessionStory("sign-in/session-first").ensure(mainSession).ensure(mainReturn).dispose(mainSession);

/**
 * Elif signs in before the page to return to is saved.
 */
export const returnSavedLate = sessionStory("sign-in/return-saved-late")
  .world(elifSaved)
  .ensure(mainSession)
  .send(mainSession, signedIn)
  .ensure(mainReturn)
  .send(mainReturn, ReturnTo.E.Save({ route: "/pano", draft: "" }))
  .checkpoint("saved");

/**
 * Elif trusts her laptop, then signs out: the laptop is let go and ends after its grace, and her
 * session is forgotten; the laptop ensured again reads a signed-out session, so trusting it again,
 * until a later date with a label, is denied.
 */
export const deviceSessionForgotten = trustedStory("sign-in/device-session-forgotten")
  .world(elifSaved)
  .ensure(mainSession)
  .ensure(laptop)
  .send(mainSession, signedIn)
  .send(laptop, TrustedDevice.E.Trust({ until: LAPTOP_UNTIL }))
  .detach(laptop)
  .advance("1 second")
  .dispose(mainSession, { how: "forget" })
  .ensure(laptop)
  .send(laptop, TrustedDevice.E.Trust({ until: LATEST, label: "again" }))
  .checkpoint("fresh");

const trusted = (id: string) =>
  trustedStory(id)
    .world(elifSaved)
    .ensure(mainSession)
    .ensure(laptop)
    .send(mainSession, signedIn)
    .send(laptop, TrustedDevice.E.Trust({ until: LAPTOP_UNTIL }));

/**
 * The trusted laptop is disposed first, then its session.
 */
export const deviceFirst = trusted("sign-in/device-first")
  .dispose(laptop)
  .dispose(mainSession)
  .checkpoint("disposed");

/**
 * The session is disposed while the trusted laptop is bound to it.
 */
export const sessionFirstUnderDevice = () =>
  trusted("sign-in/session-first-under-device").dispose(mainSession);

/**
 * Session and laptop, two layers; the tab reloads and only the laptop, the deepest node, is
 * ensured.
 */
export const deviceChain = trusted("sign-in/device-chain")
  .reload({ reattach: false })
  .ensure(laptop)
  .checkpoint("reloaded");

const device = { id: "Auth/TrustedDevice", states: ["UNTRUSTED"], events: { Revoke: {} } } as const;

/**
 * A device whose session slot is the session's definition itself, not `Flow.context`.
 */
export const deviceWithDefinitionAsContext = () =>
  // @ts-expect-error Compile R4: a context slot is Flow.context's
  definition({ ...device, context: { session: AuthSession } });

/**
 * A device whose trust date is written as the text "date" instead of a field Schema.
 */
export const deviceWithTextField = () =>
  // @ts-expect-error Compile R4: an event field is a Schema
  definition({ ...device, events: { Trust: { until: "date" } } });

/**
 * A device that reads its account by the bare `me` contract instead of `me.outcomes(...)`.
 */
export const deviceWithBareContract = () =>
  definition({
    ...device,
    internalEvents: { MeRead: { handle: Schema.String } },
    // @ts-expect-error Compile R4: an operation is a bound contract
    operations: () => ({ me }),
  });

/**
 * A device whose weekly reminder is written `{ day: 7 }`, a key no Duration has (`days` is).
 */
export const deviceRemindingByDay = () =>
  machine(TrustedDevice, ({ S, E }) => ({
    default: S.UNTRUSTED,
    states: {
      TRUSTED: {
        default: S.TRUSTED.FRESH,
        states: {
          // @ts-expect-error Compile R4: a delay is a Duration input
          FRESH: { schedules: { reverify: { schedule: { day: 7 }, send: E.Reverify } } },
        },
      },
    },
  }));

/**
 * A device whose revoke handler was left `null` while it was being written.
 */
export const deviceWithNullHandler = () =>
  // @ts-expect-error Compile R4: a handler is never null
  machine(TrustedDevice, ({ S }) => ({ default: S.UNTRUSTED, on: { Revoke: null } }));

/**
 * A device whose reminder reads its days from a setting that was never set: NaN days, which
 * Effect's Duration reads as zero, so the reminder builds as a 0 ms delay.
 */
export const deviceRemindingNaNDays = () =>
  machine(TrustedDevice, ({ S, E }) => ({
    default: S.UNTRUSTED,
    states: {
      TRUSTED: {
        default: S.TRUSTED.FRESH,
        states: {
          FRESH: {
            schedules: { reverify: { schedule: { days: Number.NaN }, send: E.Reverify } },
          },
        },
      },
    },
  }));

/**
 * A device whose reminder is set to never come: an infinite number of days.
 */
export const deviceRemindingNever = () =>
  machine(TrustedDevice, ({ S, E }) => ({
    default: S.UNTRUSTED,
    states: {
      TRUSTED: {
        default: S.TRUSTED.FRESH,
        states: {
          FRESH: {
            schedules: {
              reverify: { schedule: { days: Number.POSITIVE_INFINITY }, send: E.Reverify },
            },
          },
        },
      },
    },
  }));
