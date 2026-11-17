import { Layer } from "effect";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { AuthLive } from "./adapters/auth.ts";
import { ProfileLive } from "./adapters/profiles.ts";
import { SignInMachine } from "./machines/sign-in.ts";
import { ReturnToMachine } from "./machines/return-to.ts";
import { AuthSessionMachine } from "./machines/session.ts";

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
  ),
  scope: "auth",
  persistence: { captureMs: 0 },
});
