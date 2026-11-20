import { describe, expect, it } from "vite-plus/test";
import { screen } from "../../fixtures/sign-in/app.ts";
import { Auth } from "../../fixtures/sign-in/server/auth.ts";
import { long, usual } from "../../fixtures/sign-in/stories/usual.ts";
import { checked } from "../rules/rules.ts";

describe("the usual and long sign-in Stories", () => {
  it("a wrong code counts, a resend cools down, the right code signs in, and a throttled request says so (Turn R2, R14)", async () => {
    const run = checked(await usual.run());
    const { wrong, cooling, throttled, end } = run.checkpoints;

    expect(wrong.read(screen)?.state).toBe("CODE");
    expect(wrong.read(screen)?.memory).toEqual(
      expect.objectContaining({ tries: 1, notice: "Wrong code." }),
    );
    expect(cooling.read(screen)?.state).toBe("COOLDOWN");
    expect(cooling.read(Auth.begin)).toHaveLength(2);
    expect(run.checkpoints["signed in"].read(screen)?.state).toBe("DONE");
    expect(run.checkpoints["signed in"].read(Auth).sessions).toEqual(["ada@example.com"]);
    expect(throttled.read(screen)?.memory.notice).toBe("Too many codes. Wait a minute.");
    expect(end.read(screen)?.state).toBe("EMAIL");
  });

  it("the long Story of nine sign-ins signs three of them in twice at the server, because the first answer was lost after landing (Turn R14, WriteLanes R2)", async () => {
    const run = checked(await long.run());

    expect(run.end.read(Auth).sessions).toHaveLength(12);
    expect(run.end.read(screen)?.state).toBe("EMAIL");
  });
});
