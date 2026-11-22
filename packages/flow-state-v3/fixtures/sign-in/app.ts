import { Layer } from "effect";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { AuthLive } from "./adapters/auth.ts";
import { ProfileLive } from "./adapters/profiles.ts";
import { SignInMachine } from "./machines/sign-in.ts";
import { ReturnToMachine } from "./machines/return-to.ts";
import { AuthSessionMachine } from "./machines/session.ts";
import { TrustedDeviceMachine } from "./machines/trusted-device.ts";
import { SessionBannerMachine } from "./machines/session-banner.ts";
import { IdleSignOutMachine } from "./machines/idle-sign-out.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";

/**
 * The sign-in app: one machine.
 */
export const authApp = app({ id: "auth", machines: { signIn: SignInMachine } });

/**
 * The sign-in app's real setup: the auth server over HTTP, with no persistence.
 */
export const authSetup = runtimeSetup({ app: authApp, services: AuthLive("https://auth.example") });

/**
 * The sign-in screen the stories use.
 */
export const screen = actorRef(SignInMachine, "screen");

/**
 * Elif's session.
 */
export const mainSession = actorRef(AuthSessionMachine, { email: "elif@kamp.us" });

/**
 * A session with an empty email.
 */
export const blankSession = actorRef(AuthSessionMachine, { email: "" });

/**
 * The session of an account whose email is 100,000 characters.
 */
export const longSession = actorRef(AuthSessionMachine, {
  email: `${"e".repeat(100_000)}@kamp.us`,
});

/**
 * The `n`th of many accounts' sessions.
 */
export const sessionOf = (n: number) =>
  actorRef(AuthSessionMachine, { email: `user${String(n)}@kamp.us` });

/**
 * The page to return to after Elif signs in.
 */
export const mainReturn = actorRef(ReturnToMachine, "return");

/**
 * The `n`th of many sign-in screens.
 */
export const screenOf = (n: number) => actorRef(SignInMachine, `screen-${String(n)}`);

/**
 * The sign-in app grown with a persisted session and the page to return to around the screen.
 */
export const authGrown = app({
  id: "auth",
  machines: {
    signIn: SignInMachine,
    session: AuthSessionMachine,
    returnTo: { machine: ReturnToMachine, context: { session: mainSession } },
  },
});

/**
 * The grown sign-in app's real setup: the auth and profile services over HTTP, persisted, each
 * capture written at once; the screen itself is never persisted.
 */
export const authGrownSetup = runtimeSetup({
  app: authGrown,
  services: Layer.mergeAll(
    AuthLive("https://auth.example"),
    ProfileLive("https://profile.example"),
    layerIndexedDb(),
  ),
  scope: "auth",
  persistence: { captureMs: 0 },
});

/**
 * Elif's laptop, a device her session may trust.
 */
export const laptop = actorRef(TrustedDeviceMachine, { device: "laptop" });

/**
 * The `n`th of many devices.
 */
export const deviceOf = (n: number) =>
  actorRef(TrustedDeviceMachine, { device: `device-${String(n)}` });

/**
 * The grown sign-in app with the devices Elif's session trusts.
 */
export const authTrusted = app({
  id: "auth",
  machines: {
    signIn: SignInMachine,
    session: AuthSessionMachine,
    returnTo: { machine: ReturnToMachine, context: { session: mainSession } },
    devices: { machine: TrustedDeviceMachine, context: { session: mainSession } },
  },
});

/**
 * The trusted-devices app's real setup, as the grown app's: both services over HTTP, persisted,
 * each capture written at once.
 */
export const authTrustedSetup = runtimeSetup({
  app: authTrusted,
  services: Layer.mergeAll(
    AuthLive("https://auth.example"),
    ProfileLive("https://profile.example"),
    layerIndexedDb(),
  ),
  scope: "auth",
  persistence: { captureMs: 0 },
});

/**
 * The account bar's banner of the main session.
 */
export const mainBanner = actorRef(SessionBannerMachine, "banner");

/**
 * The sign-in app grown with the account bar's banner, which reads the main session's state.
 */
export const authBannered = app({
  id: "auth",
  machines: {
    ...authTrusted.machines,
    banner: {
      machine: SessionBannerMachine,
      context: { signedIn: mainSession, phase: mainSession },
    },
  },
});

/**
 * The grown sign-in app's real setup: the auth and profile services over HTTP, persisted, each
 * capture written at once.
 */
export const authBanneredSetup = runtimeSetup({
  app: authBannered,
  services: Layer.mergeAll(
    AuthLive("https://auth.example"),
    ProfileLive("https://profile.example"),
    layerIndexedDb(),
  ),
  scope: "auth",
  persistence: { captureMs: 0 },
});

/**
 * The main session's idle sign-out.
 */
export const mainIdle = actorRef(IdleSignOutMachine, { session: "elif" });

/**
 * The `n`th of many sessions' idle sign-outs.
 */
export const idleOf = (n: number) =>
  actorRef(IdleSignOutMachine, { session: `session-${String(n)}` });

/**
 * The sign-in app grown with each session's idle sign-out.
 */
export const authIdle = app({
  id: "auth",
  machines: { ...authBannered.machines, idle: IdleSignOutMachine },
});

/**
 * The idle sign-in app's real setup, as the bannered app's.
 */
export const authIdleSetup = runtimeSetup({
  app: authIdle,
  services: Layer.mergeAll(
    AuthLive("https://auth.example"),
    ProfileLive("https://profile.example"),
    layerIndexedDb(),
  ),
  scope: "auth",
  persistence: { captureMs: 0 },
});
