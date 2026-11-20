import { makeFreezer } from "./frozen.ts";
import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Input } from "./input.ts";
import { step } from "./step.ts";
import { retain } from "./tx.ts";
import { emptyWorld } from "./world.ts";

const env = { now: 0, seed: "0", admit: makeFreezer(), step: () => Option.none() };

describe("a step's world (Turn realization)", () => {
  it("Turn realization: a world a step returned is taken by one step; stepping it again is a defect", () => {
    const booting = step(new Map(), emptyWorld(true), Input.Start(), env).world;

    const open = step(
      new Map(),
      booting,
      Input.Boot({ stored: Option.some(new Map()) }),
      env,
    ).world;

    expect(() => step(new Map(), booting, Input.Serve(), env)).toThrow(/Defect/);
    expect(open.life._tag).toBe("Open");
  });

  it("Turn realization: a retained world is never written by the steps after it", () => {
    const booting = step(new Map(), emptyWorld(true), Input.Start(), env).world;
    retain(booting);

    const open = step(
      new Map(),
      booting,
      Input.Boot({ stored: Option.some(new Map()) }),
      env,
    ).world;

    const again = step(
      new Map(),
      booting,
      Input.Boot({ stored: Option.some(new Map()) }),
      env,
    ).world;

    expect(booting.life._tag).toBe("Booting");
    expect([open.life._tag, again.life._tag]).toEqual(["Open", "Open"]);
  });
});
