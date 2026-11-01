// Each deliberately wrong file in this folder states the line it must produce; this test asserts it. The files are
// excluded from the app and from every Story glob, so the desk itself never runs them (COVERAGE.md 5.4: I3, I4).
//
// Three kinds of finding live here, and only the first is `flow check`'s (2.10.14):
//   - static findings (`error`, `warning`, `info`): `check({ modules })` reads the module as data and reports them;
//   - `DehydrateCommitInFlight` is a `hydration` record (2.10.11): a run reports it, so it is read from a Story;
//   - `UnprovenValues` and `RegistrationChurn` are `diagnostic` records of a run (2.10.6, 2.11.13): a Story must run
//     the stream in a host and read `cp.records("diagnostic")`.
//
// design gap: 2.10.14 names `flow check` as a command over the configuration. A programmatic form a test can call
// on chosen modules is assumed here: `check({ modules })` returns the findings `flow check --format json` prints,
// each `{ code, level, at, message }`.
import { check } from "flow-state/check"; // design gap: the programmatic `flow check`
import { Story } from "flow-state/testing";
import { expect, test } from "vite-plus/test";
import { DeskSetup } from "../../app/setup.js";
import { DeskClient } from "../../testing/desk.fake.js";
import { wrongSsr } from "./dehydrate-commit-in-flight.js";

const files = import.meta.glob<{ expected: { code: string; level: string; at: string } }>(
  "./*.ts",
  { eager: true },
);

for (const [path, module] of Object.entries(files)) {
  if (path.endsWith(".test.ts")) continue;

  // The two stream diagnostics need a host that runs the stream, and the module exports only the stream.
  // design gap: no Story can run a bare `stream(...)`, so there is nothing to read `diagnostic` records from; the
  // module would need to export a host and a Story (see the findings file).
  if (module.expected.level === "diagnostic") {
    test.todo(`${path}: ${module.expected.code} (a \`diagnostic\` record of a run)`);
    continue;
  }

  // A hydration record, not a static finding: the browser's run reports the commit that was in flight on the server.
  if (module.expected.code === "DehydrateCommitInFlight") continue;

  test(`${path}: ${module.expected.code}`, async () => {
    const findings = await check({ modules: [module] });

    expect(findings).toContainEqual(
      expect.objectContaining({
        code: module.expected.code,
        level: module.expected.level,
        at: module.expected.at,
      }),
    );
  });
}

// `wrongSsr` is a hydration source, so it sets no `world` (MD 2.10.11): the destination holds the save.
test("DehydrateCommitInFlight: a save in flight at dehydration is evidence on the client", async () => {
  const browser = Story.app(DeskSetup, { id: "findings/wrong-ssr-browser", fixtures: [DeskClient] })
    .hydrate(wrongSsr, "page")
    .checkpoint("hydrated");

  const { hydrated } = (await browser.run()).checkpoints;

  expect(hydrated.records("hydration")).toContainEqual(
    expect.objectContaining({ code: "DehydrateCommitInFlight" }),
  );
});
