import { describe, expect, it } from "vite-plus/test";
import { mainBanner } from "../../fixtures/sign-in/app.ts";
import {
  bannerLoadFails,
  bannerNewAccount,
  bannerReloaded,
  bannerSignsIn,
} from "../../fixtures/sign-in/stories/context.ts";
import { played } from "../rules/played.ts";

describe("the banner reads its session's state as context (Compile R4, Turn R22)", () => {
  it("Compile R4, Turn R22: a state token reads a boolean and X.state the step's name; each step is shown and signing in welcomes once", async () => {
    const run = await played(bannerSignsIn);

    expect(run.checkpoints.out.read(mainBanner)).toEqual(
      expect.objectContaining({
        context: { signedIn: false, phase: "SIGNED_OUT" },
        memory: { step: "", steps: 0, welcomes: 0 },
      }),
    );
    expect(run.checkpoints.in.read(mainBanner)).toEqual(
      expect.objectContaining({
        context: { signedIn: true, phase: "SIGNED_IN" },
        memory: { step: "SIGNED_IN", steps: 2, welcomes: 1 },
      }),
    );
  });

  it("Turn R22, Actors R18: a memory-only turn of the session changes none of the banner's reads; a new account's steps are each shown once", async () => {
    const run = await played(bannerNewAccount);

    expect(run.checkpoints.choosing.read(mainBanner)?.memory).toEqual({
      step: "CHOOSING",
      steps: 2,
      welcomes: 0,
    });
    expect(run.checkpoints.in.read(mainBanner)?.memory).toEqual({
      step: "SIGNED_IN",
      steps: 4,
      welcomes: 1,
    });
  });

  it("Turn R22: a lost account read shows both steps and welcomes no one", async () => {
    const run = await played(bannerLoadFails);

    expect(run.checkpoints.out.read(mainBanner)).toEqual(
      expect.objectContaining({
        context: { signedIn: false, phase: "SIGNED_OUT" },
        memory: { step: "SIGNED_OUT", steps: 2, welcomes: 0 },
      }),
    );
  });

  it("Turn R22: a banner admitted after a reload reads its restored session silently", async () => {
    const run = await played(bannerReloaded);

    expect(run.checkpoints.reloaded.read(mainBanner)).toEqual(
      expect.objectContaining({
        context: { signedIn: true, phase: "SIGNED_IN" },
        memory: { step: "", steps: 0, welcomes: 0 },
      }),
    );
  });
});
