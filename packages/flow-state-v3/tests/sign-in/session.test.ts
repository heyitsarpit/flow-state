import { describe, expect, it } from "vite-plus/test";
import {
  blankSession,
  mainReturn,
  mainSession,
  screenOf,
  sessionOf,
} from "../../fixtures/sign-in/app.ts";
import { emailAtBound, emptyCode, emptyEmail } from "../../fixtures/sign-in/stories/edges.ts";
import {
  blankHandle,
  submitTwice,
  unconfirmedPrefill,
} from "../../fixtures/sign-in/stories/findings.ts";
import { manyScreens, manySessions, reloadInLockout } from "../../fixtures/sign-in/stories/load.ts";
import {
  reloadedMidHandle,
  returnSavedLate,
  screenFirst,
  sessionFirst,
  signOutForgets,
} from "../../fixtures/sign-in/stories/structure.ts";
import { handleRetry } from "../../fixtures/sign-in/stories/usual.ts";
import { screen } from "../../fixtures/sign-in/machine.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";

const setUsernames = (cut: Cut) => cut.calls.filter((c) => c.endpoint === "setUsername").length;

describe("a persisted session around the sign-in screen", () => {
  it("Compile R5; Turn R23: the session's handle starts computed from its email, and a Story sees the private refresh token the profile service gave it (Machines O8)", async () => {
    const run = await played(handleRetry);

    expect(run.checkpoints.opened.read(mainSession)?.memory).toEqual(
      expect.objectContaining({ email: "elif@kamp.us", handle: "elif", refreshToken: "" }),
    );
    expect(run.checkpoints.stuck.read(mainSession)?.memory["refreshToken"]).toBe("rt-elif@kamp.us");
  });

  it("a failed handle save holds the redirect and keeps the handle; a retry that lands releases it, and the draft returns", async () => {
    const run = await played(handleRetry);
    const { stuck, released, submitted } = run.checkpoints;

    expect(stuck.read(mainSession)).toEqual(
      expect.objectContaining({
        state: "HANDLE_FAILED",
        memory: expect.objectContaining({ handle: "elif-kaya", held: true }),
      }),
    );
    expect(setUsernames(stuck)).toBe(1);
    expect(stuck.read(mainReturn)?.state).toBe("WAITING");
    expect(setUsernames(released)).toBe(2);
    expect(released.read(mainSession)).toEqual(
      expect.objectContaining({
        state: "SIGNED_IN",
        memory: expect.objectContaining({ held: false }),
      }),
    );
    expect(released.read(mainReturn)).toEqual(
      expect.objectContaining({
        state: "RETURNED",
        memory: { route: "/sozluk/effect", draft: "merhaba" },
      }),
    );
    expect(submitted.read(mainReturn)?.memory).toEqual({ route: "/sozluk/effect", draft: "" });
  });

  it("Turn R12: a blank handle never calls setUsername and never holds the redirect", async () => {
    const run = await played(blankHandle);

    expect(setUsernames(run.checkpoints.submitted)).toBe(0);
    expect(run.checkpoints.submitted.read(mainSession)?.memory["held"]).toBe(false);
  });

  it("WriteLanes R7: a second submit while the first is on the wire is refused, the redirect held once and released once", async () => {
    const run = await played(submitTwice);

    expect(setUsernames(run.checkpoints.twice)).toBe(1);
    expect(run.checkpoints.twice.read(mainSession)?.memory["held"]).toBe(true);
    expect(run.checkpoints.landed.read(mainSession)?.memory["held"]).toBe(false);
  });

  it("an unedited prefilled handle asks to be confirmed before it is saved", async () => {
    const run = await played(unconfirmedPrefill);

    expect(run.checkpoints.asked.read(mainSession)?.state).toBe("CONFIRMING");
    expect(setUsernames(run.checkpoints.asked)).toBe(0);
    expect(setUsernames(run.checkpoints.confirmed)).toBe(1);
    expect(run.checkpoints.confirmed.read(mainSession)?.state).toBe("SIGNED_IN");
  });

  it("Actors R21: signing out forgets the session, so the next one starts signed out with its handle computed again", async () => {
    const run = await played(signOutForgets);

    expect(run.checkpoints.fresh.read(mainSession)).toEqual(
      expect.objectContaining({
        state: "SIGNED_OUT",
        memory: expect.objectContaining({ handle: "elif", refreshToken: "" }),
      }),
    );
  });
});

describe("many sign-ins (fixtures.md L1, S3)", () => {
  it("L1 x 16: one screen locks out after six wrong codes while another verifies", async () => {
    const run = await played(manyScreens);

    expect(run.checkpoints.end.read(screenOf(0))?.state).toBe("LOCKED");
    expect(run.checkpoints.end.read(screenOf(1))?.state).toBe("DONE");
  });

  it("S3 x 16 under L4: 16 sessions signed in, restored signed in after each of two reloads (WriteAhead R1)", async () => {
    const run = await played(manySessions);

    expect(run.checkpoints.end.read(sessionOf(15))?.state).toBe("SIGNED_IN");
    expect(run.checkpoints.end.read(sessionOf(0))?.memory["handle"]).toBe("user0");
  });
});

describe("the session's ends (fixtures.md S6)", () => {
  it("S6 screen first: the unpersisted screen ends while the session lives on", async () => {
    const run = await played(screenFirst);

    expect(run.checkpoints.ended.read(mainSession)?.state).toBe("SIGNED_IN");
  });

  it("S6 reloaded, WriteAhead R14, WriteLanes R8: a handle save on the wire at a reload ends unknown Restored; the session retries it once as the same Attempt, it lands and the redirect is released", async () => {
    const run = await played(reloadedMidHandle);

    const attempts = run.checkpoints.reloaded.calls
      .filter((c) => c.endpoint === "setUsername")
      .map((c) => c.input["key"]);

    expect(attempts).toHaveLength(2);
    expect(new Set(attempts).size).toBe(1);
    expect(run.checkpoints.reloaded.read(mainSession)?.memory["held"]).toBe(false);
    expect(run.checkpoints.reloaded.read(mainReturn)?.state).toBe("RETURNED");
  });

  it("Actors R20, Stories R3: disposing the session while its return is bound is refused BlockedByDependents, naming the return", async () => {
    await expect(sessionFirst().run()).rejects.toThrow(/BlockedByDependents: .*Auth\/ReturnTo/u);
  });
});

describe("a lockout across a reload (fixtures.md L4)", () => {
  it("WriteAhead R1, Actors R9: the unpersisted screen, locked out, starts again at its email after a reload, its wrong tries gone", async () => {
    const run = await played(reloadInLockout);

    expect(run.checkpoints.locked.read(screenOf(0))?.state).toBe("LOCKED");
    expect(run.checkpoints.reloaded.read(screenOf(0))).toEqual(
      expect.objectContaining({ state: "EMAIL", memory: expect.objectContaining({ tries: 0 }) }),
    );
  });
});

describe("emails at their edges (fixtures.md E1, E3)", () => {
  it("E1: a code of no characters is a wrong code to the auth server, counted as a try", async () => {
    const run = await played(emptyCode);

    expect(run.checkpoints.entered.read(screen)?.memory).toEqual(
      expect.objectContaining({ tries: 1, notice: "Wrong code." }),
    );
  });

  it("E1, Compile R5: an empty email computes an empty handle, and the screen sends it to the auth server as typed", async () => {
    const run = await played(emptyEmail);

    expect(run.checkpoints.opened.read(blankSession)?.memory["handle"]).toBe("");
    expect(
      run.end.calls.filter((c) => c.endpoint === "begin").map((c) => c.input["email"]),
    ).toEqual([""]);
  });

  it("E3, Operations O1: an email whose begin key is exactly 8,192 bytes is sent a code", async () => {
    const run = await played(emailAtBound);

    expect(run.end.calls.filter((c) => c.endpoint === "begin")).toHaveLength(1);
  });
});

describe("a return saved after its session signed in (fixtures.md S6)", () => {
  it.fails("Turn R12: a return saved after its session is signed in returns at once, its guard reading the session as context", async () => {
    const run = await played(returnSavedLate);

    expect(run.checkpoints.saved.read(mainReturn)?.state).toBe("RETURNED");
  });
});
