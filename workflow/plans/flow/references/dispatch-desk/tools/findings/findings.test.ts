// Each deliberately wrong file in this folder states the `flow check` line it must produce; this test asserts it.
// The files are excluded from the app and from every Story glob, so the desk itself never runs them (COVERAGE.md
// 5.4: I3, I4).
//
// design gap: 2.10.14 names `flow check` as a command over the configuration. A programmatic form a test can call
// on chosen modules is assumed here: `check({ modules })` returns the findings `flow check --format json` prints,
// each `{ code, level, at, message }`. Stream findings are pending merge 6; `UnprovenValues` and
// `RegistrationChurn` are runtime diagnostics, so their check runs the module's stream in a Story and reads the
// `diagnostic` records instead.
import { check } from "flow-state/check"; // design gap: the programmatic `flow check`
import { expect, test } from "vite-plus/test";

const files = import.meta.glob<{ expected: { code: string; level: string; at: string } }>(
  "./*.ts",
  { eager: true },
);

for (const [path, module] of Object.entries(files)) {
  if (path.endsWith(".test.ts")) continue;

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
