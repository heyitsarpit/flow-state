import { Schema } from "effect";
import { definition, machine } from "../../../src/index.ts";
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

// FLOW_STATE_ALLOW_UNKNOWN: each builder hands construction a form its types refuse.
const untyped = (value: unknown) =>
  // SAFETY: every refused form here is one the types reject; construction must refuse it at run time too.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-escape-hatch-assertion -- the untyped caller construction guards against
  value as never;

const device = { id: "Auth/TrustedDevice", states: ["UNTRUSTED"], events: { Revoke: {} } };

/**
 * A device whose session slot is the session's definition itself, not `Provider.select`.
 */
export const deviceWithDefinitionAsContext = () =>
  definition(untyped({ ...device, context: { session: AuthSession } }));

/**
 * A device whose trust date is written as the text "date" instead of a field Schema.
 */
export const deviceWithTextField = () =>
  definition(untyped({ ...device, events: { Trust: { until: "date" } } }));

/**
 * A device that reads its account by the bare `me` contract instead of `me.outcomes(...)`.
 */
export const deviceWithBareContract = () =>
  definition(
    untyped({
      ...device,
      internalEvents: { MeRead: { handle: Schema.String } },
      operations: () => ({ me }),
    }),
  );

/**
 * A device whose weekly reminder is written `{ day: 7 }`, a key no Duration has (`days` is).
 */
export const deviceRemindingByDay = () =>
  machine(TrustedDevice, ({ S, E }) =>
    untyped({
      default: S.UNTRUSTED,
      states: {
        TRUSTED: {
          default: S.TRUSTED.FRESH,
          states: {
            FRESH: { schedules: { reverify: { schedule: { day: 7 }, send: E.Reverify } } },
          },
        },
      },
    }),
  );

/**
 * A device whose revoke handler was left `null` while it was being written.
 */
export const deviceWithNullHandler = () =>
  machine(TrustedDevice, ({ S }) => untyped({ default: S.UNTRUSTED, on: { Revoke: null } }));

/**
 * A device whose reminder reads its days from a setting that was never set: NaN days.
 */
export const deviceRemindingNaNDays = () =>
  machine(TrustedDevice, ({ S, E }) =>
    untyped({
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
    }),
  );

/**
 * A device whose reminder is set to never come: an infinite number of days.
 */
export const deviceRemindingNever = () =>
  machine(TrustedDevice, ({ S, E }) =>
    untyped({
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
    }),
  );
